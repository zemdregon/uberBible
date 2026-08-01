#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { languageHint } = require('./lib/books');
const { parseUsfmBook, buildVerseRecord } = require('./lib/usfm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_EBIBLE = path.join(ROOT, 'source', 'ebible');
const DERIVED_JSONL = path.join(ROOT, 'derived', 'jsonl');
const DERIVED_MD = path.join(ROOT, 'derived', 'md');
const MANIFEST_PATH = path.join(ROOT, 'derived', 'manifest.json');
const CATALOG_PATH = path.join(ROOT, 'source', '_meta', 'catalog.json');

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

function loadCatalogIndex() {
  if (!fs.existsSync(CATALOG_PATH)) return {};
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const byId = {};
  for (const t of catalog.ebible || []) byId[t.id] = t;
  return byId;
}

function listTranslationIds() {
  return fs
    .readdirSync(SOURCE_EBIBLE, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => fs.existsSync(path.join(SOURCE_EBIBLE, id, 'usfm')))
    .sort();
}

function normalizeOne(id, catalogById) {
  const usfmDir = path.join(SOURCE_EBIBLE, id, 'usfm');
  if (!fs.existsSync(usfmDir)) {
    return { id, status: 'skip', reason: 'no usfm/', verses: 0 };
  }

  let meta = {};
  const metaPath = path.join(SOURCE_EBIBLE, id, 'meta.json');
  if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const cat = catalogById[id] || {};
  const translationName = meta.title || cat.title || id;
  const language = languageHint(id, cat.language);
  const license = meta.license || cat.license || 'public-domain';

  const files = fs
    .readdirSync(usfmDir)
    .filter((f) => f.endsWith('.usfm') && !/^00-|^01-INT/i.test(f))
    .sort();

  const records = [];
  let skippedBooks = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(usfmDir, file), 'utf8');
    // Prefer \id; also try filename book code (NN-XXXrest.usfm)
    const parsed = parseUsfmBook(content);
    if (!parsed.length) {
      // deuterocanon / unknown book with no resolve
      const idLine = /^\\id\s+(\S+)/m.exec(content);
      if (idLine) {
        const { resolveBook } = require('./lib/books');
        if (!resolveBook(idLine[1])) skippedBooks++;
      }
      continue;
    }
    for (const v of parsed) {
      records.push(
        buildVerseRecord(
          { translationId: id, translationName, language, license },
          v
        )
      );
    }
  }

  fs.mkdirSync(DERIVED_JSONL, { recursive: true });
  fs.mkdirSync(DERIVED_MD, { recursive: true }); // reserved for future MD exporters
  const outPath = path.join(DERIVED_JSONL, `${id}.jsonl`);
  const body = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
  fs.writeFileSync(outPath, body);

  return {
    id,
    status: 'ok',
    verses: records.length,
    files: files.length,
    skipped_non_protestant_or_empty: skippedBooks,
    path: path.relative(ROOT, outPath),
    language,
    translation_name: translationName,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const catalogById = loadCatalogIndex();
  let ids = args.ids;
  if (args.all || !ids.length) {
    if (!args.all && !ids.length) {
      console.error('Usage: node scripts/normalize-usfm.js --id eng-kjv2006 | --all');
      process.exit(1);
    }
    ids = listTranslationIds();
  }

  fs.mkdirSync(path.join(ROOT, 'derived'), { recursive: true });
  fs.mkdirSync(DERIVED_JSONL, { recursive: true });
  fs.mkdirSync(DERIVED_MD, { recursive: true });
  if (!fs.existsSync(path.join(DERIVED_MD, '.gitkeep'))) {
    fs.writeFileSync(path.join(DERIVED_MD, '.gitkeep'), '');
  }

  const results = [];
  for (const id of ids) {
    const r = normalizeOne(id, catalogById);
    results.push(r);
    const msg =
      r.status === 'ok'
        ? `OK ${id}: ${r.verses} verses → ${r.path}`
        : `SKIP ${id}: ${r.reason}`;
    console.log(msg);
  }

  const prev = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { formats: {} };

  const byId = { ...(prev.formats?.jsonl?.translations || {}) };
  for (const r of results) {
    if (r.status === 'ok') byId[r.id] = r;
  }

  const manifest = {
    generated: new Date().toISOString(),
    note: 'derived/ holds processed exports by format (jsonl, md, …). source/ stays raw. Embeddings/Qdrant consume jsonl; they are not the only goal.',
    formats: {
      ...(prev.formats || {}),
      jsonl: {
        dir: 'derived/jsonl',
        description: 'One JSON object per verse (JSONL), ready for RAG, search, MD export, etc.',
        translations: byId,
      },
      md: {
        dir: 'derived/md',
        description: 'Reserved for Markdown exports (not built in this pass).',
        translations: prev.formats?.md?.translations || {},
      },
    },
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)}`);
}

main();
