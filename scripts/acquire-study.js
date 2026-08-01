#!/usr/bin/env node
'use strict';

/**
 * Download study materials listed in source/_meta/study-catalog.json
 * into source/study/{id}/. Idempotent; skips when marker file present unless --force.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const { createWriteStream, createReadStream } = require('fs');
const { Readable } = require('stream');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'source', '_meta', 'study-catalog.json');
const STUDY_ROOT = path.join(ROOT, 'source', 'study');
const LOG = path.join(ROOT, 'source', '_meta', 'study-download_log.tsv');

function parseArgs(argv) {
  const args = { ids: [], all: false, force: false, wave: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--force') args.force = true;
    else if (a === '--wave') args.wave = Number(argv[++i]);
    else if (a.startsWith('--wave=')) args.wave = Number(a.slice(7));
    else if (a === '--id') args.ids.push(argv[++i]);
    else if (a.startsWith('--id=')) args.ids.push(a.slice(5));
    else if (!a.startsWith('-')) args.ids.push(a);
  }
  return args;
}

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}

function assertLicense(work, allowed) {
  if (!allowed.includes(work.license)) {
    throw new Error(`Refusing ${work.id}: license ${work.license} not in allowed list`);
  }
}

function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': 'uberBible-study-acquire/1.0',
          Accept: '*/*',
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 8) return reject(new Error(`Too many redirects for ${url}`));
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(fetchBuffer(next, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

function fetchJson(url) {
  return fetchBuffer(url).then((b) => JSON.parse(b.toString('utf8')));
}

async function writeFileEnsured(dest, buf) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

async function extractZip(buf, destDir, stripPrefix) {
  // Minimal ZIP extractor (store + deflate) without external unzip.
  const entries = [];
  let i = 0;
  while (i + 30 <= buf.length) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const uncompSize = buf.readUInt32LE(i + 22);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const dataStart = i + 30 + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    i = dataStart + compSize;
    if (name.endsWith('/')) continue;
    let outName = name;
    if (stripPrefix) {
      const pref = stripPrefix.endsWith('/') ? stripPrefix : stripPrefix + '/';
      if (outName.startsWith(pref)) outName = outName.slice(pref.length);
      else if (outName.startsWith(stripPrefix)) outName = outName.slice(stripPrefix.length).replace(/^\//, '');
    }
    if (!outName || outName.includes('..')) continue;
    let content;
    if (method === 0) content = data;
    else if (method === 8) content = zlib.inflateRawSync(data);
    else throw new Error(`Unsupported ZIP method ${method} for ${name}`);
    if (uncompSize && content.length !== uncompSize && method === 8) {
      // allow slight mismatch
    }
    entries.push({ name: outName, content });
  }
  if (!entries.length) throw new Error('No ZIP entries extracted');
  for (const e of entries) {
    const dest = path.join(destDir, e.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, e.content);
  }
  return entries.length;
}

async function acquireFiles(work, destDir) {
  for (const f of work.acquire.files) {
    const buf = await fetchBuffer(f.url);
    await writeFileEnsured(path.join(destDir, f.path), buf);
    console.log(`  file ${f.path} (${buf.length} bytes)`);
  }
}

async function acquireZip(work, destDir) {
  const buf = await fetchBuffer(work.acquire.url);
  const n = await extractZip(buf, destDir, work.acquire.strip_prefix || null);
  console.log(`  zip extracted ${n} files (${buf.length} bytes compressed)`);
}

async function acquireGithubDir(work, destDir) {
  const listing = await fetchJson(work.acquire.api);
  if (!Array.isArray(listing)) throw new Error(`GitHub API did not return array for ${work.id}`);
  const out = path.join(destDir, work.acquire.dest || 'entries');
  fs.mkdirSync(out, { recursive: true });
  for (const item of listing) {
    if (item.type !== 'file') continue;
    if (item.name === '_index.json') continue;
    const buf = await fetchBuffer(item.download_url);
    await writeFileEnsured(path.join(out, item.name), buf);
    console.log(`  ${item.name} (${buf.length} bytes)`);
  }
}

function writeMeta(work, destDir, status, bytes) {
  const meta = {
    id: work.id,
    title: work.title,
    kind: work.kind,
    license: work.license,
    attribution: work.attribution,
    source: work.source,
    acquired: new Date().toISOString(),
    status,
    bytes,
  };
  fs.writeFileSync(path.join(destDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
}

function appendLog(row) {
  const header = 'id\ttitle\tstatus\tkind\tlicense\tbytes\tpath\n';
  if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, header);
  fs.appendFileSync(LOG, row + '\n');
}

function dirBytes(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

async function acquireOne(work, force) {
  const destDir = path.join(STUDY_ROOT, work.id);
  const marker = path.join(destDir, 'meta.json');
  if (!force && fs.existsSync(marker)) {
    console.log(`skip ${work.id} (already acquired; use --force)`);
    return { id: work.id, status: 'skip' };
  }

  console.log(`acquire ${work.id}…`);
  fs.mkdirSync(destDir, { recursive: true });
  // clear previous contents except we rewrite
  for (const ent of fs.readdirSync(destDir)) {
    fs.rmSync(path.join(destDir, ent), { recursive: true, force: true });
  }

  const type = work.acquire.type;
  if (type === 'files') await acquireFiles(work, destDir);
  else if (type === 'zip') await acquireZip(work, destDir);
  else if (type === 'github-dir') await acquireGithubDir(work, destDir);
  else throw new Error(`Unknown acquire type ${type} for ${work.id}`);

  const bytes = dirBytes(destDir);
  writeMeta(work, destDir, 'ok', bytes);
  appendLog(
    `${work.id}\t${work.title}\tok\t${work.kind}\t${work.license}\t${bytes}\t${path.relative(ROOT, destDir)}`
  );
  return { id: work.id, status: 'ok', bytes };
}

async function main() {
  const args = parseArgs(process.argv);
  const catalog = loadCatalog();
  const allowed = catalog.allowed_licenses || [];

  let works = catalog.works || [];
  if (args.wave != null) works = works.filter((w) => w.wave === args.wave);
  if (!args.all && args.ids.length) {
    const set = new Set(args.ids);
    works = works.filter((w) => set.has(w.id));
  } else if (!args.all && args.wave == null && !args.ids.length) {
    console.error('Usage: node scripts/acquire-study.js --all | --wave N | --id <id>…');
    process.exit(1);
  }

  fs.mkdirSync(STUDY_ROOT, { recursive: true });
  // reset log when doing full acquire with force, else append
  if (args.force && args.all) fs.writeFileSync(LOG, 'id\ttitle\tstatus\tkind\tlicense\tbytes\tpath\n');

  let ok = 0;
  for (const work of works) {
    assertLicense(work, allowed);
    try {
      const r = await acquireOne(work, args.force);
      if (r.status === 'ok') ok++;
    } catch (err) {
      console.error(`FAIL ${work.id}: ${err.message}`);
      appendLog(`${work.id}\t${work.title}\tfail\t${work.kind}\t${work.license}\t0\t`);
      process.exitCode = 1;
    }
  }
  console.log(`Done. Newly acquired: ${ok}/${works.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
