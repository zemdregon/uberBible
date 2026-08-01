#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { normalizeStrongsDat, normalizeHebrewLexiconXml, normalizeTbe } = require('./lib/study/strongs');
const { normalizeOpenBibleCrossrefs } = require('./lib/study/crossrefs');
const { normalizeNeuuDictionary } = require('./lib/study/dictionary');
const { normalizeNave, normalizeTorrey } = require('./lib/study/topical');
const {
  normalizeOpenBibleGeo,
  normalizeBradyPeople,
  normalizeBradyPlaces,
} = require('./lib/study/gazetteer');
const { normalizeMatthewHenry, normalizeJfb, normalizeBarnes } = require('./lib/study/commentary');

const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'source', '_meta', 'study-catalog.json');
const STUDY_SOURCE = path.join(ROOT, 'source', 'study');
const OUT_DIR = path.join(ROOT, 'derived', 'study', 'jsonl');
const MANIFEST = path.join(ROOT, 'derived', 'study', 'manifest.json');
const INDEX_OUT = path.join(ROOT, 'source', '_meta', 'STUDY_INDEX.txt');

const ADAPTERS = {
  'strongs-hebrew': normalizeStrongsDat,
  'strongs-greek': normalizeStrongsDat,
  'hebrew-lexicon': normalizeHebrewLexiconXml,
  'openbible-crossrefs': normalizeOpenBibleCrossrefs,
  easton: normalizeNeuuDictionary,
  smith: normalizeNeuuDictionary,
  hitchcock: normalizeNeuuDictionary,
  nave: normalizeNave,
  'openbible-geo': normalizeOpenBibleGeo,
  'bible-people': normalizeBradyPeople,
  'bible-places': normalizeBradyPlaces,
  tbesh: normalizeTbe,
  tbesg: normalizeTbe,
  torrey: normalizeTorrey,
  'matthew-henry': normalizeMatthewHenry,
  jfb: normalizeJfb,
  barnes: normalizeBarnes,
};

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

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) {
    return {
      generated: new Date().toISOString(),
      note: 'derived/study holds processed study-material exports (separate from verse Bibles).',
      formats: { jsonl: { dir: 'derived/study/jsonl', works: {} } },
    };
  }
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function writeStudyIndex(catalog, manifest) {
  const lines = [
    'uberBible study materials',
    '=========================',
    '',
    catalog.scope,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Works in catalog: ${(catalog.works || []).length}`,
    '',
    '## Works',
  ];
  for (const w of catalog.works || []) {
    const m = manifest.formats.jsonl.works[w.id];
    const status = m ? `${m.status}, ${m.records} records` : 'not normalized';
    lines.push(`- ${w.id}: ${w.title} [${w.kind}] (${w.license}) — ${status}`);
    lines.push(`  source: ${w.source}`);
  }
  lines.push('');
  fs.writeFileSync(INDEX_OUT, lines.join('\n'));
}

function normalizeOne(work) {
  const src = path.join(STUDY_SOURCE, work.id);
  if (!fs.existsSync(src)) {
    return { id: work.id, status: 'skip', reason: 'not acquired', records: 0 };
  }
  const adapter = ADAPTERS[work.id];
  if (!adapter) {
    return { id: work.id, status: 'skip', reason: 'no adapter', records: 0 };
  }
  console.log(`normalize ${work.id}…`);
  const records = adapter(work, src);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${work.id}.jsonl`);
  const fd = fs.openSync(outPath, 'w');
  try {
    for (const r of records) {
      fs.writeSync(fd, JSON.stringify(r) + '\n');
    }
  } finally {
    fs.closeSync(fd);
  }
  console.log(`  ${records.length} records → ${path.relative(ROOT, outPath)}`);
  return {
    id: work.id,
    status: 'ok',
    records: records.length,
    path: path.relative(ROOT, outPath),
    kind: work.kind,
    license: work.license,
    title: work.title,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const catalog = loadCatalog();
  let works = catalog.works || [];
  if (!args.all) {
    if (!args.ids.length) {
      console.error('Usage: node scripts/normalize-study.js --all | --id <id>…');
      process.exit(1);
    }
    const set = new Set(args.ids);
    works = works.filter((w) => set.has(w.id));
  }

  const manifest = loadManifest();
  for (const work of works) {
    try {
      const r = normalizeOne(work);
      if (r.status === 'ok') {
        manifest.formats.jsonl.works[work.id] = {
          id: work.id,
          status: 'ok',
          records: r.records,
          path: r.path,
          kind: r.kind,
          license: r.license,
          title: r.title,
        };
      } else {
        console.log(`  skip: ${r.reason}`);
        manifest.formats.jsonl.works[work.id] = {
          id: work.id,
          status: 'skip',
          reason: r.reason,
          records: 0,
        };
      }
    } catch (err) {
      console.error(`FAIL ${work.id}: ${err.message}`);
      manifest.formats.jsonl.works[work.id] = {
        id: work.id,
        status: 'error',
        error: String(err.message || err),
        records: 0,
      };
      process.exitCode = 1;
    }
  }
  manifest.generated = new Date().toISOString();
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  writeStudyIndex(catalog, manifest);
  console.log(`Wrote ${path.relative(ROOT, MANIFEST)} and ${path.relative(ROOT, INDEX_OUT)}`);
}

main();
