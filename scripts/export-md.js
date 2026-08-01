#!/usr/bin/env node
'use strict';

/**
 * Export derived/jsonl → derived/md/{translation_id}/{Book}/{NN}.md
 * One Markdown file per chapter. JSONL remains the structured source of truth.
 */

const fs = require('fs');
const path = require('path');
const { BOOKS } = require('./lib/books');

const ROOT = path.resolve(__dirname, '..');
const DERIVED_JSONL = path.join(ROOT, 'derived', 'jsonl');
const DERIVED_MD = path.join(ROOT, 'derived', 'md');
const MANIFEST_PATH = path.join(ROOT, 'derived', 'manifest.json');

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

function formatTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return '[]';
  return '[' + tags.map((t) => String(t)).join(', ') + ']';
}

function chapterFilename(chapter) {
  return String(chapter).padStart(2, '0') + '.md';
}

function loadVerses(jsonlPath) {
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`${jsonlPath}:${i + 1}: ${e.message}`);
    }
  });
}

function groupChapters(verses) {
  /** @type {Map<string, { meta: object, tags: string[], verses: object[] }>} */
  const chapters = new Map();
  for (const v of verses) {
    const m = v.meta;
    if (!m?.book_osis || m.chapter == null || m.verse == null) continue;
    const key = `${m.book_osis}\0${m.chapter}`;
    let ch = chapters.get(key);
    if (!ch) {
      ch = {
        meta: {
          translation_id: m.translation_id,
          translation_name: m.translation_name,
          language: m.language,
          license: m.license,
          testament: m.testament,
          book_osis: m.book_osis,
          book_name: m.book_name,
          book_num: m.book_num,
          chapter: m.chapter,
          canon: m.canon,
        },
        tags: Array.isArray(v.tags) ? v.tags : [],
        verses: [],
      };
      chapters.set(key, ch);
    }
    ch.verses.push({ verse: m.verse, text: v.text });
  }
  for (const ch of chapters.values()) {
    ch.verses.sort((a, b) => a.verse - b.verse);
  }
  return chapters;
}

function renderChapterMd(ch) {
  const m = ch.meta;
  const id = `${m.translation_id}:${m.book_osis}.${m.chapter}`;
  const lines = [
    '---',
    `id: ${yamlEscape(id)}`,
    `translation_id: ${yamlEscape(m.translation_id)}`,
    `translation_name: ${yamlEscape(m.translation_name)}`,
    `language: ${yamlEscape(m.language)}`,
    `license: ${yamlEscape(m.license)}`,
    `testament: ${yamlEscape(m.testament)}`,
    `book_osis: ${yamlEscape(m.book_osis)}`,
    `book_name: ${yamlEscape(m.book_name)}`,
    `book_num: ${m.book_num}`,
    `chapter: ${m.chapter}`,
    `verse_count: ${ch.verses.length}`,
    `canon: ${yamlEscape(m.canon || 'protestant-66')}`,
    `tags: ${formatTags(ch.tags)}`,
    '---',
    '',
    `# ${m.book_name} ${m.chapter}`,
    '',
  ];
  for (const v of ch.verses) {
    lines.push(`**${v.verse}** ${v.text}`);
    lines.push('');
  }
  return lines.join('\n');
}

function bookOrder(bookOsis) {
  for (const b of Object.values(BOOKS)) {
    if (b.osis === bookOsis) return b.num;
  }
  return 999;
}

function renderTranslationReadme(translationId, chapters) {
  /** @type {Map<string, { book_name: string, book_num: number, testament: string, chapters: number[] }>} */
  const books = new Map();
  let translationName = translationId;
  let language = 'und';
  let license = 'public-domain';

  for (const ch of chapters.values()) {
    const m = ch.meta;
    translationName = m.translation_name || translationName;
    language = m.language || language;
    license = m.license || license;
    let book = books.get(m.book_osis);
    if (!book) {
      book = {
        book_osis: m.book_osis,
        book_name: m.book_name,
        book_num: m.book_num ?? bookOrder(m.book_osis),
        testament: m.testament,
        chapters: [],
      };
      books.set(m.book_osis, book);
    }
    book.chapters.push(m.chapter);
  }

  const sorted = [...books.values()].sort((a, b) => a.book_num - b.book_num);
  for (const b of sorted) b.chapters.sort((a, b2) => a - b2);

  const ot = sorted.filter((b) => b.testament === 'OT');
  const nt = sorted.filter((b) => b.testament === 'NT');
  const other = sorted.filter((b) => b.testament !== 'OT' && b.testament !== 'NT');

  const lines = [
    '---',
    `translation_id: ${yamlEscape(translationId)}`,
    `translation_name: ${yamlEscape(translationName)}`,
    `language: ${yamlEscape(language)}`,
    `license: ${yamlEscape(license)}`,
    `books: ${sorted.length}`,
    `chapters: ${chapters.size}`,
    '---',
    '',
    `# ${translationName}`,
    '',
    `Translation id: \`${translationId}\``,
    '',
    'Chapter files live at `{BookOsis}/{NN}.md` (e.g. `Gen/01.md`).',
    '',
  ];

  function emitSection(title, list) {
    if (!list.length) return;
    lines.push(`## ${title}`, '');
    for (const b of list) {
      lines.push(`### [${b.book_name}](${b.book_osis}/README.md)`, '');
      const links = b.chapters.map((c) => {
        const file = `${b.book_osis}/${chapterFilename(c)}`;
        return `[${c}](${file})`;
      });
      lines.push(links.join(' · '));
      lines.push('');
    }
  }

  emitSection('Old Testament', ot);
  emitSection('New Testament', nt);
  emitSection('Other', other);

  return lines.join('\n');
}

function renderBookReadme(bookMeta, chapterNums) {
  const chapters = [...chapterNums].sort((a, b) => a - b);
  const links = chapters.map((c) => `[${c}](${chapterFilename(c)})`);
  return [
    '---',
    `translation_id: ${yamlEscape(bookMeta.translation_id)}`,
    `book_osis: ${yamlEscape(bookMeta.book_osis)}`,
    `book_name: ${yamlEscape(bookMeta.book_name)}`,
    `book_num: ${bookMeta.book_num}`,
    `testament: ${yamlEscape(bookMeta.testament)}`,
    `chapters: ${chapters.length}`,
    '---',
    '',
    `# ${bookMeta.book_name}`,
    '',
    `[← ${bookMeta.translation_name}](../README.md)`,
    '',
    '## Chapters',
    '',
    links.join(' · '),
    '',
  ].join('\n');
}

function rmDirContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function exportOne(id) {
  const jsonlPath = path.join(DERIVED_JSONL, `${id}.jsonl`);
  if (!fs.existsSync(jsonlPath)) {
    return { id, status: 'skip', reason: 'missing jsonl' };
  }

  const verses = loadVerses(jsonlPath);
  if (!verses.length) {
    return { id, status: 'ok', chapters: 0, books: 0, verses: 0, path: `derived/md/${id}` };
  }

  const chapters = groupChapters(verses);
  const outRoot = path.join(DERIVED_MD, id);
  rmDirContents(outRoot);
  fs.mkdirSync(outRoot, { recursive: true });

  /** @type {Map<string, { meta: object, chapters: number[] }>} */
  const bookIndex = new Map();
  for (const ch of chapters.values()) {
    const bookDir = path.join(outRoot, ch.meta.book_osis);
    fs.mkdirSync(bookDir, { recursive: true });
    const filePath = path.join(bookDir, chapterFilename(ch.meta.chapter));
    fs.writeFileSync(filePath, renderChapterMd(ch));
    let bi = bookIndex.get(ch.meta.book_osis);
    if (!bi) {
      bi = { meta: ch.meta, chapters: [] };
      bookIndex.set(ch.meta.book_osis, bi);
    }
    bi.chapters.push(ch.meta.chapter);
  }

  for (const bi of bookIndex.values()) {
    const bookDir = path.join(outRoot, bi.meta.book_osis);
    fs.writeFileSync(path.join(bookDir, 'README.md'), renderBookReadme(bi.meta, bi.chapters));
  }

  fs.writeFileSync(path.join(outRoot, 'README.md'), renderTranslationReadme(id, chapters));

  const sampleMeta = chapters.values().next().value?.meta || {};
  return {
    id,
    status: 'ok',
    chapters: chapters.size,
    books: bookIndex.size,
    verses: verses.length,
    path: path.relative(ROOT, outRoot),
    translation_name: sampleMeta.translation_name || id,
    language: sampleMeta.language || 'und',
  };
}

function listJsonlIds() {
  return fs
    .readdirSync(DERIVED_JSONL)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.replace(/\.jsonl$/, ''))
    .sort();
}

function updateManifest(results) {
  const prev = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { formats: {} };

  const byId = { ...(prev.formats?.md?.translations || {}) };
  for (const r of results) {
    if (r.status === 'ok') byId[r.id] = r;
  }

  const manifest = {
    generated: new Date().toISOString(),
    note:
      prev.note ||
      'derived/ holds processed exports by format (jsonl, md, …). source/ stays raw. Embeddings/Qdrant consume jsonl; they are not the only goal.',
    formats: {
      ...(prev.formats || {}),
      jsonl: prev.formats?.jsonl || {
        dir: 'derived/jsonl',
        description: 'One JSON object per verse (JSONL).',
        translations: {},
      },
      md: {
        dir: 'derived/md',
        description:
          'One Markdown file per chapter under {translation_id}/{book_osis}/{NN}.md, plus README.md index. Generated from jsonl; not committed by default (large file tree).',
        translations: byId,
      },
    },
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(DERIVED_JSONL)) {
    console.error('No derived/jsonl — run: node scripts/normalize-usfm.js --all');
    process.exit(1);
  }

  let ids = args.ids;
  if (args.all) ids = listJsonlIds();
  if (!ids.length) {
    console.error('Usage: node scripts/export-md.js --id eng-kjv2006 | --all');
    process.exit(1);
  }

  fs.mkdirSync(DERIVED_MD, { recursive: true });
  if (!fs.existsSync(path.join(DERIVED_MD, '.gitkeep'))) {
    fs.writeFileSync(path.join(DERIVED_MD, '.gitkeep'), '');
  }

  const results = [];
  for (const id of ids) {
    const r = exportOne(id);
    results.push(r);
    if (r.status === 'ok') {
      console.log(`OK ${id}: ${r.chapters} chapters, ${r.books} books → ${r.path}`);
    } else {
      console.log(`SKIP ${id}: ${r.reason}`);
    }
  }

  updateManifest(results);
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)}`);
}

main();
