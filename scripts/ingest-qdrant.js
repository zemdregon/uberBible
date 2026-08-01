#!/usr/bin/env node
'use strict';

/**
 * Optional consumer: embed derived/jsonl verses via local Ollama → Qdrant.
 * Embeddings are one use of the derived corpus, not the project goal.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DERIVED_JSONL = path.join(ROOT, 'derived', 'jsonl');

const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const COLLECTION = process.env.QDRANT_COLLECTION || 'uberbible_verses';
const BATCH = parseInt(process.env.INGEST_BATCH || '32', 10);
const CONCURRENCY = parseInt(process.env.INGEST_CONCURRENCY || '2', 10);

function parseArgs(argv) {
  const args = { ids: [], all: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--id') args.ids.push(argv[++i]);
    else if (a.startsWith('--id=')) args.ids.push(a.slice(5));
    else if (!a.startsWith('-')) args.ids.push(a);
  }
  return args;
}

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama embed ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (!data.embedding?.length) throw new Error('Ollama returned empty embedding');
  return data.embedding;
}

async function qdrant(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${QDRANT_URL}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Qdrant ${method} ${pathname} ${res.status}: ${text}`);
  }
  return data;
}

async function ensureCollection(vectorSize) {
  let exists = false;
  try {
    await qdrant(`/collections/${COLLECTION}`);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    await qdrant(`/collections/${COLLECTION}`, {
      method: 'PUT',
      body: {
        vectors: { size: vectorSize, distance: 'Cosine' },
      },
    });
    console.log(`Created collection ${COLLECTION} (dim=${vectorSize})`);
  }

  const indexes = [
    ['meta.translation_id', 'keyword'],
    ['meta.book_osis', 'keyword'],
    ['meta.language', 'keyword'],
    ['meta.testament', 'keyword'],
    ['meta.chapter', 'integer'],
  ];
  for (const [field, schema] of indexes) {
    try {
      await qdrant(`/collections/${COLLECTION}/index`, {
        method: 'PUT',
        body: { field_name: field, field_schema: schema },
      });
    } catch {
      // already exists
    }
  }
}

function loadJsonl(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`${filePath}:${i + 1}: ${e.message}`);
    }
  });
}

function pointId(recordId) {
  // Qdrant accepts UUID or unsigned int; use UUID v5-like hash via simple string uuid namespace
  // Use hash to uint as string won't work — use UUID from digest
  const crypto = require('crypto');
  const hex = crypto.createHash('sha1').update(recordId).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '5' + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join('-');
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

async function ingestFile(filePath) {
  const records = loadJsonl(filePath);
  if (!records.length) {
    console.log(`Empty ${path.basename(filePath)}`);
    return { file: filePath, upserted: 0 };
  }

  // Probe dimension
  const probe = await ollamaEmbed(records[0].text_for_embed || records[0].text);
  await ensureCollection(probe.length);

  let upserted = 0;
  for (let offset = 0; offset < records.length; offset += BATCH) {
    const batch = records.slice(offset, offset + BATCH);
    const vectors = await mapPool(batch, CONCURRENCY, async (rec, j) => {
      if (offset === 0 && j === 0) return probe;
      return ollamaEmbed(rec.text_for_embed || rec.text);
    });

    const points = batch.map((rec, j) => ({
      id: pointId(rec.id),
      vector: vectors[j],
      payload: {
        ...rec,
        record_id: rec.id,
      },
    }));

    await qdrant(`/collections/${COLLECTION}/points?wait=true`, {
      method: 'PUT',
      body: { points },
    });

    upserted += points.length;
    process.stdout.write(
      `\r${path.basename(filePath)}: ${upserted}/${records.length}`
    );
  }
  process.stdout.write('\n');
  return { file: filePath, upserted };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(DERIVED_JSONL)) {
    console.error('No derived/jsonl — run: node scripts/normalize-usfm.js --id eng-kjv2006');
    process.exit(1);
  }

  let files;
  if (args.all) {
    files = fs
      .readdirSync(DERIVED_JSONL)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(DERIVED_JSONL, f))
      .sort();
  } else if (args.ids.length) {
    files = args.ids.map((id) => path.join(DERIVED_JSONL, `${id}.jsonl`));
    for (const f of files) {
      if (!fs.existsSync(f)) {
        console.error(`Missing ${f} — normalize first`);
        process.exit(1);
      }
    }
  } else {
    console.error('Usage: node scripts/ingest-qdrant.js --id eng-kjv2006 | --all');
    process.exit(1);
  }

  // Health checks
  try {
    const tags = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!tags.ok) throw new Error(String(tags.status));
  } catch (e) {
    console.error(`Ollama not reachable at ${OLLAMA_HOST}: ${e.message}`);
    process.exit(1);
  }
  try {
    await qdrant('/collections');
  } catch (e) {
    console.error(`Qdrant not reachable at ${QDRANT_URL}: ${e.message}`);
    console.error('Start e.g.: docker run -p 6333:6333 qdrant/qdrant');
    process.exit(1);
  }

  console.log(`Ollama model=${OLLAMA_EMBED_MODEL} → Qdrant ${COLLECTION}`);
  let total = 0;
  for (const f of files) {
    const r = await ingestFile(f);
    total += r.upserted;
  }
  console.log(`Done. Upserted ${total} points.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
