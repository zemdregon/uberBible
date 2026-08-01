'use strict';

const fs = require('fs');
const path = require('path');
const { buildStudyRecord, resolveOsisBook } = require('./refs');

const BOOK_DIR_ALIASES = {
  genesis: 'Gen',
  exodus: 'Exod',
  leviticus: 'Lev',
  numbers: 'Num',
  deuteronomy: 'Deut',
  joshua: 'Josh',
  judges: 'Judg',
  ruth: 'Ruth',
  '1-samuel': '1Sam',
  '2-samuel': '2Sam',
  '1-kings': '1Kgs',
  '2-kings': '2Kgs',
  '1-chronicles': '1Chr',
  '2-chronicles': '2Chr',
  ezra: 'Ezra',
  nehemiah: 'Neh',
  esther: 'Esth',
  job: 'Job',
  psalms: 'Ps',
  psalm: 'Ps',
  proverbs: 'Prov',
  ecclesiastes: 'Eccl',
  'song-of-solomon': 'Song',
  'song-of-songs': 'Song',
  isaiah: 'Isa',
  jeremiah: 'Jer',
  lamentations: 'Lam',
  ezekiel: 'Ezek',
  daniel: 'Dan',
  hosea: 'Hos',
  joel: 'Joel',
  amos: 'Amos',
  obadiah: 'Obad',
  jonah: 'Jonah',
  micah: 'Mic',
  nahum: 'Nah',
  habakkuk: 'Hab',
  zephaniah: 'Zeph',
  haggai: 'Hag',
  zechariah: 'Zech',
  malachi: 'Mal',
  matthew: 'Matt',
  mark: 'Mark',
  luke: 'Luke',
  john: 'John',
  acts: 'Acts',
  romans: 'Rom',
  '1-corinthians': '1Cor',
  '2-corinthians': '2Cor',
  galatians: 'Gal',
  ephesians: 'Eph',
  philippians: 'Phil',
  colossians: 'Col',
  '1-thessalonians': '1Thess',
  '2-thessalonians': '2Thess',
  '1-timothy': '1Tim',
  '2-timothy': '2Tim',
  titus: 'Titus',
  philemon: 'Phlm',
  hebrews: 'Heb',
  james: 'Jas',
  '1-peter': '1Pet',
  '2-peter': '2Pet',
  '1-john': '1John',
  '2-john': '2John',
  '3-john': '3John',
  jude: 'Jude',
  revelation: 'Rev',
};

function stripFrontmatter(md) {
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3);
    if (end >= 0) return md.slice(end + 4).replace(/^\s+/, '');
  }
  return md;
}

function walkMdFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMdFiles(p, out);
    else if (ent.isFile() && ent.name.endsWith('.md') && ent.name !== '_index.md' && ent.name !== 'README.md' && ent.name !== 'preface.md') {
      out.push(p);
    }
  }
  return out;
}

function normalizeMatthewHenry(work, sourceDir) {
  const files = walkMdFiles(sourceDir);
  const records = [];
  for (const file of files) {
    const rel = path.relative(sourceDir, file);
    const parts = rel.split(path.sep);
    // volume-N / book / chapter-N.md
    const bookDir = parts.find((p) => BOOK_DIR_ALIASES[p.toLowerCase()] || resolveOsisBook(p));
    const chapFile = parts[parts.length - 1];
    const cm = /chapter-(\d+)\.md$/i.exec(chapFile);
    if (!bookDir || !cm) continue;
    const book = resolveOsisBook(BOOK_DIR_ALIASES[bookDir.toLowerCase()] || bookDir);
    if (!book) continue;
    const chapter = Number(cm[1]);
    let body = stripFrontmatter(fs.readFileSync(file, 'utf8'));
    body = body.replace(/^#.*$/m, '').trim();
    if (!body) continue;
    // Chunk by verse markers **¹** or Ge 1:1 style headings if present; else whole chapter
    const chunks = [];
    const verseSplit = body.split(/(?=^> \*\*[¹²³⁴⁵⁶⁷⁸⁹⁰0-9]+)/m);
    if (verseSplit.length > 1) {
      let verseNum = 0;
      for (const chunk of verseSplit) {
        const vm = /^\s*>\s*\*\*([0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+)/.exec(chunk);
        if (vm) {
          const raw = vm[1]
            .replace(/¹/g, '1')
            .replace(/²/g, '2')
            .replace(/³/g, '3')
            .replace(/⁴/g, '4')
            .replace(/⁵/g, '5')
            .replace(/⁶/g, '6')
            .replace(/⁷/g, '7')
            .replace(/⁸/g, '8')
            .replace(/⁹/g, '9')
            .replace(/⁰/g, '0');
          verseNum = parseInt(raw, 10) || verseNum + 1;
        } else {
          verseNum = verseNum || 0;
        }
        const text = chunk.trim();
        if (text.length < 40) continue;
        chunks.push({ verse: verseNum || 1, text });
      }
    } else {
      chunks.push({ verse: 1, text: body });
    }

    // Also emit one chapter-level record (truncated) for navigation
    const chapterKey = `${book.osis}.${chapter}`;
    const chapterText = body.replace(/\s+/g, ' ').slice(0, 2000);
    records.push(
      buildStudyRecord({
        work,
        entryKey: chapterKey,
        text: chapterText,
        textForEmbed: `Matthew Henry on ${book.name} ${chapter}: ${chapterText.slice(0, 400)}`,
        refs: [`${book.osis}.${chapter}.1`],
        extraMeta: {
          book_osis: book.osis,
          book_name: book.name,
          chapter,
          level: 'chapter',
        },
      })
    );

    for (const c of chunks) {
      if (c.text.length < 80) continue;
      const key = `${book.osis}.${chapter}.${c.verse}`;
      // avoid duplicate chapter key when single chunk
      if (key === chapterKey && chunks.length === 1) continue;
      const text = c.text.replace(/\s+/g, ' ').trim().slice(0, 8000);
      records.push(
        buildStudyRecord({
          work,
          entryKey: `${key}-note`,
          text,
          textForEmbed: `Matthew Henry on ${book.name} ${chapter}:${c.verse}: ${text.slice(0, 400)}`,
          refs: [key],
          extraMeta: {
            book_osis: book.osis,
            book_name: book.name,
            chapter,
            verse: c.verse,
            level: 'verse',
          },
        })
      );
    }
  }
  return records;
}

function resolveBookTitle(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (/^THE\s+ACTS\s+OF\s+THE\s+APOSTLES$/i.test(s)) return resolveOsisBook('Acts');
  if (/^THE\s+REVELATION/i.test(s)) return resolveOsisBook('Revelation');
  let m = /^THE\s+GOSPEL\s+ACCORDING\s+TO\s+(.+)$/i.exec(s);
  if (m) return resolveOsisBook(m[1]);
  m = /^THE\s+(FIRST|SECOND|THIRD)\s+EPISTLE\b(?:.*\b(?:OF|TO)(?:\s+THE)?\s+)?(.+)$/i.exec(s);
  if (m) {
    const n = { FIRST: '1', SECOND: '2', THIRD: '3' }[m[1].toUpperCase()];
    const rest = m[2].replace(/^PAUL\s+(THE\s+APOSTLE\s+)?/i, '').trim();
    return resolveOsisBook(`${n} ${rest}`);
  }
  m = /^THE\s+GENERAL\s+EPISTLE\s+OF\s+(.+)$/i.exec(s);
  if (m) return resolveOsisBook(m[1]);
  m = /^THE\s+EPISTLE\b(?:.*\b(?:OF|TO)(?:\s+THE)?\s+)?(.+)$/i.exec(s);
  if (m) {
    const rest = m[1].replace(/^PAUL\s+(THE\s+APOSTLE\s+)?/i, '').trim();
    return resolveOsisBook(rest);
  }
  m = /^THE\s+BOOK\s+OF\s+(.+)$/i.exec(s);
  if (m) return resolveOsisBook(m[1]);
  m = /^THE\s+(.+)$/i.exec(s);
  if (m) return resolveOsisBook(m[1]);
  return resolveOsisBook(s);
}

function pushChapterRecord(records, work, book, chapter, body) {
  const text = body.replace(/\s+/g, ' ').trim();
  if (!book || !chapter || text.length < 60) return;
  records.push(
    buildStudyRecord({
      work,
      entryKey: `${book.osis}.${chapter}`,
      text: text.slice(0, 12000),
      textForEmbed: `${work.title}: ${book.name} ${chapter} — ${text.slice(0, 400)}`,
      refs: [`${book.osis}.${chapter}.1`],
      extraMeta: {
        book_osis: book.osis,
        book_name: book.name,
        chapter,
        level: 'chapter',
      },
    })
  );
}

/** Barnes NT Notes: "THE GOSPEL ACCORDING TO MATTHEW - Chapter 1" */
function normalizeBarnes(work, sourceDir) {
  const file = path.join(sourceDir, 'ntnotes.txt');
  if (!fs.existsSync(file)) throw new Error('ntnotes.txt missing');
  const text = fs.readFileSync(file, 'utf8');
  const re = /^(THE .+?) - Chapter (\d+)\s*$/gm;
  const headers = [];
  let m;
  while ((m = re.exec(text))) {
    headers.push({ index: m.index, title: m[1].trim(), chapter: Number(m[2]), end: m.index + m[0].length });
  }
  const records = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    // Skip verse-level duplicates: "… Chapter 1 - Verse 1" already excluded by regex
    const book = resolveBookTitle(h.title);
    if (!book) continue;
    const start = h.end;
    const end = i + 1 < headers.length ? headers[i + 1].index : text.length;
    const body = text.slice(start, end);
    // Prefer aggregating chapter: if next headers are same book+chapter with verse lines, merge until chapter changes
    pushChapterRecord(records, work, book, h.chapter, body);
  }
  // Dedupe by entry_key keeping longest text
  const best = new Map();
  for (const r of records) {
    const prev = best.get(r.meta.entry_key);
    if (!prev || r.text.length > prev.text.length) best.set(r.meta.entry_key, r);
  }
  return [...best.values()];
}

/** JFB: book banners + "CHAPTER N" */
function normalizeJfb(work, sourceDir) {
  const file = path.join(sourceDir, 'jfb.txt');
  if (!fs.existsSync(file)) throw new Error('jfb.txt missing');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const records = [];
  let book = null;
  let chapter = null;
  let buf = [];

  function flush() {
    pushChapterRecord(records, work, book, chapter, buf.join('\n'));
    buf = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const ch = /^CHAPTER\s+(\d+)\b/i.exec(trimmed);
    if (ch) {
      flush();
      chapter = Number(ch[1]);
      continue;
    }
    // Book title lines: centered-ish all caps, or "COMMENTARY ON …"
    let maybe = trimmed
      .replace(/^COMMENTARY\s+ON\s+/i, '')
      .replace(/^THE\s+BOOK\s+OF\s+/i, '');
    if (
      maybe.length >= 3 &&
      maybe.length <= 48 &&
      /^[A-Z0-9][A-Z0-9\s\-']+$/.test(maybe) &&
      !/CHAPTER|INTRODUCTION|CRITICAL|EXPLANATORY|NOTES|PREFACE|APPENDIX|PENTATEUCH|HISTORICAL|PROPHETICAL|POETICAL/.test(
        maybe
      )
    ) {
      const b = resolveBookTitle(maybe);
      if (b) {
        flush();
        book = b;
        chapter = null;
        continue;
      }
    }
    if (book && chapter) buf.push(line);
  }
  flush();
  return records;
}

module.exports = {
  normalizeMatthewHenry,
  normalizeJfb,
  normalizeBarnes,
};
