#!/usr/bin/env node
'use strict';

/**
 * Export derived/study/jsonl → derived/study/md/{work_id}/…
 */

const fs = require('fs');
const path = require('path');
const { slugify } = require('./lib/study/refs');

const ROOT = path.resolve(__dirname, '..');
const JSONL_DIR = path.join(ROOT, 'derived', 'study', 'jsonl');
const MD_ROOT = path.join(ROOT, 'derived', 'study', 'md');
const MANIFEST = path.join(ROOT, 'derived', 'study', 'manifest.json');

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

function yamlEscape(value) {
  if (value == null) return '""';
  const s = String(value);
  if (/^[A-Za-z0-9_./:+-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function loadRecords(id) {
  const p = path.join(JSONL_DIR, `${id}.jsonl`);
  if (!fs.existsSync(p)) return null;
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function letterBucket(key, headword) {
  const s = String(headword || key || 'x');
  const ch = s.replace(/^[^A-Za-z]+/, '')[0];
  return ch ? ch.toUpperCase() : '#';
}

function exportAlphaEntries(workId, records, meta) {
  const byLetter = new Map();
  for (const r of records) {
    const letter = letterBucket(r.meta.entry_key, r.meta.headword || r.meta.lemma || r.meta.name);
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(r);
  }
  const letters = [...byLetter.keys()].sort();
  for (const letter of letters) {
    const items = byLetter.get(letter);
    const body = items
      .map((r) => {
        const title = r.meta.headword || r.meta.lemma || r.meta.entry_key;
        const refs = (r.meta.refs || []).slice(0, 20).join(', ');
        return `### ${title}\n\n${r.text}\n\n${refs ? `*Refs:* ${refs}\n` : ''}`;
      })
      .join('\n');
    writeFile(
      path.join(MD_ROOT, workId, `${letter}.md`),
      `---\nwork_id: ${yamlEscape(workId)}\nwork_title: ${yamlEscape(meta.title)}\nkind: ${yamlEscape(meta.kind)}\nletter: ${letter}\n---\n\n# ${meta.title} — ${letter}\n\n${body}`
    );
  }
  return letters.map((l) => `- [${l}](${l}.md)`).join('\n');
}

function exportChapterTree(workId, records, meta) {
  const byBook = new Map();
  for (const r of records) {
    if (r.meta.level === 'verse' || r.meta.level === 'chunk') continue;
    const book = r.meta.book_osis || (r.meta.from_ref && r.meta.from_ref.split('.')[0]) || 'Misc';
    const chapter = r.meta.chapter || Number((r.meta.entry_key || '').split('.')[1]) || 0;
    if (!byBook.has(book)) byBook.set(book, new Map());
    byBook.get(book).set(chapter || r.meta.entry_key, r);
  }
  // crossrefs: group by book.chapter from entry_key Gen.1.1
  if (meta.kind === 'crossref') {
    for (const r of records) {
      const parts = String(r.meta.entry_key || '').split('.');
      if (parts.length < 2) continue;
      const book = parts[0];
      const chapter = Number(parts[1]);
      if (!byBook.has(book)) byBook.set(book, new Map());
      const map = byBook.get(book);
      if (!map.has(chapter)) map.set(chapter, { chapterRecords: [] });
      const slot = map.get(chapter);
      if (!slot.chapterRecords) {
        map.set(chapter, { chapterRecords: [r], meta: { book_osis: book, chapter } });
      } else slot.chapterRecords.push(r);
    }
  }

  const index = [];
  for (const book of [...byBook.keys()].sort()) {
    const chapters = byBook.get(book);
    const chapLinks = [];
    for (const [ch, payload] of [...chapters.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const nn = String(ch).padStart(2, '0');
      let body;
      if (payload.chapterRecords) {
        body = payload.chapterRecords
          .map((r) => `### ${r.meta.entry_key}\n\n${r.text}\n`)
          .join('\n');
      } else {
        body = payload.text;
      }
      writeFile(
        path.join(MD_ROOT, workId, book, `${nn}.md`),
        `---\nwork_id: ${yamlEscape(workId)}\nbook_osis: ${yamlEscape(book)}\nchapter: ${ch}\n---\n\n# ${book} ${ch}\n\n${body}\n`
      );
      chapLinks.push(`- [${book} ${ch}](${book}/${nn}.md)`);
    }
    index.push(`### ${book}\n\n${chapLinks.join('\n')}`);
  }
  return index.join('\n\n');
}

function exportTopicPages(workId, records, meta) {
  const links = [];
  for (const r of records) {
    const key = slugify(r.meta.entry_key || r.meta.subject || 'topic');
    const title = r.meta.subject || r.meta.headword || r.meta.entry_key;
    writeFile(
      path.join(MD_ROOT, workId, 'topics', `${key}.md`),
      `---\nwork_id: ${yamlEscape(workId)}\nentry_key: ${yamlEscape(r.meta.entry_key)}\n---\n\n# ${title}\n\n${r.text}\n`
    );
    links.push(`- [${title}](topics/${key}.md)`);
  }
  // also a compact index file split if huge
  writeFile(path.join(MD_ROOT, workId, 'topics.md'), `# Topics\n\n${links.join('\n')}\n`);
  return `- [All topics](topics.md) (${records.length})`;
}

function exportGazetteer(workId, records, meta) {
  const links = [];
  for (const r of records) {
    const key = slugify(r.meta.entry_key || r.meta.name || 'place');
    const title = r.meta.name || r.meta.entry_key;
    writeFile(
      path.join(MD_ROOT, workId, 'entries', `${key}.md`),
      `---\nwork_id: ${yamlEscape(workId)}\nentry_key: ${yamlEscape(r.meta.entry_key)}\n---\n\n# ${title}\n\n${r.text}\n`
    );
    links.push(`- [${title}](entries/${key}.md)`);
  }
  writeFile(path.join(MD_ROOT, workId, 'entries.md'), `# Entries\n\n${links.join('\n')}\n`);
  return `- [All entries](entries.md) (${records.length})`;
}

function exportOne(id, manifestEntry) {
  const records = loadRecords(id);
  if (!records) {
    console.log(`skip ${id}: no jsonl`);
    return null;
  }
  const meta = {
    title: (manifestEntry && manifestEntry.title) || id,
    kind: (manifestEntry && manifestEntry.kind) || records[0].meta.kind,
    license: (manifestEntry && manifestEntry.license) || records[0].meta.license,
  };

  const outDir = path.join(MD_ROOT, id);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  let toc;
  if (['lexicon', 'dictionary', 'morphology'].includes(meta.kind)) {
    toc = exportAlphaEntries(id, records, meta);
  } else if (meta.kind === 'topical') {
    toc = exportTopicPages(id, records, meta);
  } else if (meta.kind === 'gazetteer') {
    toc = exportGazetteer(id, records, meta);
  } else if (meta.kind === 'crossref' || meta.kind === 'commentary') {
    toc = exportChapterTree(id, records, meta);
  } else {
    toc = exportAlphaEntries(id, records, meta);
  }

  const readme = `---
work_id: ${yamlEscape(id)}
work_title: ${yamlEscape(meta.title)}
kind: ${yamlEscape(meta.kind)}
license: ${yamlEscape(meta.license)}
records: ${records.length}
---

# ${meta.title}

- **id:** \`${id}\`
- **kind:** ${meta.kind}
- **license:** ${meta.license}
- **records:** ${records.length}

## Contents

${toc}
`;
  writeFile(path.join(outDir, 'README.md'), readme);
  console.log(`export ${id}: ${records.length} records`);
  return { id, records: records.length };
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(JSONL_DIR)) {
    console.error('Missing derived/study/jsonl — run normalize-study.js first');
    process.exit(1);
  }
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { formats: { jsonl: { works: {} } } };
  let ids = fs
    .readdirSync(JSONL_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace(/\.jsonl$/, ''));
  if (!args.all) {
    if (!args.ids.length) {
      console.error('Usage: node scripts/export-study-md.js --all | --id <id>…');
      process.exit(1);
    }
    const set = new Set(args.ids);
    ids = ids.filter((id) => set.has(id));
  }
  fs.mkdirSync(MD_ROOT, { recursive: true });
  for (const id of ids) {
    exportOne(id, manifest.formats.jsonl.works[id]);
  }
}

main();
