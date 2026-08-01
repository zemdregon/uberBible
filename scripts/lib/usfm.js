'use strict';

const { resolveBook } = require('./books');

/**
 * Strip USFM markup to plain verse text; collect Strong's numbers.
 */
function cleanVerseText(raw) {
  const strongs = [];
  let s = String(raw ?? '');

  // Footnotes and cross-refs (may span)
  s = s.replace(/\\f\s.*?\\f\*/gs, '');
  s = s.replace(/\\x\s.*?\\x\*/gs, '');
  s = s.replace(/\\fig\s.*?\\fig\*/gs, '');

  // Word milestones with Strong's — \w / \+w (nested), optional space after marker
  // e.g. \w beginning|strong="H7225"\w*   \+w For|strong="G1063"\+w*
  s = s.replace(/\\\+?w\s*([^\\|\\\\]+)\|([^\\]*)\\\+?w\*/g, (_, word, attrs) => {
    const m = /strong="([^"]+)"/i.exec(attrs);
    if (m) {
      for (const part of m[1].split(/[,;\s]+/)) {
        const t = part.trim();
        if (t) strongs.push(t);
      }
    }
    return word;
  });
  // Bare \w word\w* / \+w word\+w*
  s = s.replace(/\\\+?w\s*([^\\]+)\\\+?w\*/g, '$1');

  // Character markup that wraps text (including nested \+ forms)
  for (const tag of ['add', 'nd', 'pn', 'qt', 'tl', 'it', 'bd', 'em', 'sc', 'bk', 'wj', 'w']) {
    const re = new RegExp(String.raw`\\\+?${tag}\s*([^\\]*)\\\+?${tag}\*`, 'gi');
    s = s.replace(re, '$1');
  }

  // Drop remaining closed markers and orphan backslash tags
  s = s.replace(/\\\+?[a-z]+\d?\*/gi, '');
  s = s.replace(/\\\+?[a-z]+\d?\s*/gi, '');

  // Poetry / paragraph leftovers
  s = s.replace(/¶/g, '');
  s = s.replace(/\s+/g, ' ').trim();

  // Dedupe strongs preserving order
  const seen = new Set();
  const uniqueStrongs = [];
  for (const x of strongs) {
    if (!seen.has(x)) {
      seen.add(x);
      uniqueStrongs.push(x);
    }
  }

  return { text: s, strongs: uniqueStrongs };
}

/**
 * Parse a single USFM book file into verse objects (without translation wrapper).
 */
function parseUsfmBook(content) {
  const verses = [];
  let book = null;
  let chapter = 0;
  let pending = null; // { verse, raw }

  const flush = () => {
    if (!pending || !book || !chapter) {
      pending = null;
      return;
    }
    const { text, strongs } = cleanVerseText(pending.raw);
    if (text) {
      verses.push({
        bookCode: book.code,
        book,
        chapter,
        verse: pending.verse,
        text,
        strongs,
      });
    }
    pending = null;
  };

  // Normalize line endings; keep content as stream of marker-led chunks
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let line of lines) {
    // Continue verse text on non-marker lines
    if (pending && !/^\s*\\/.test(line)) {
      pending.raw += ' ' + line.trim();
      continue;
    }

    const idMatch = /^\s*\\id\s+(\S+)/.exec(line);
    if (idMatch) {
      flush();
      book = resolveBook(idMatch[1]);
      continue;
    }

    const cMatch = /^\s*\\c\s+(\d+)/.exec(line);
    if (cMatch) {
      flush();
      chapter = parseInt(cMatch[1], 10);
      continue;
    }

    const vMatch = /^\s*\\v\s+(\d+)(?:\s+(.*))?$/.exec(line);
    if (vMatch) {
      flush();
      pending = { verse: parseInt(vMatch[1], 10), raw: vMatch[2] || '' };
      continue;
    }

    // Markers that interrupt verse text but aren't verse content
    if (/^\s*\\(p|q\d?|m|mi|pi\d?|b|cls|nb|pc|ph\d?|li\d?|d|sp|qa|qr|qc|qm\d?|b|ide|h|toc\d|mt\d?|ms\d?|mr|s\d?|r|cl|cd|iot|io\d?|ip|imi|imq|ipr|iq\d?|ib|ili\d?|iot|iex|im|is\d?|rem|sts|restore|pub|restore)\b/.test(line)) {
      // paragraph/poetry: still attach residual text after marker to pending verse
      if (pending) {
        const rest = line.replace(/^\s*\\[a-z0-9]+\s*/i, '').trim();
        if (rest) pending.raw += ' ' + rest;
      }
      continue;
    }

    if (pending && /^\s*\\/.test(line)) {
      // Unknown marker mid-verse: strip marker, keep text
      const rest = line.replace(/^\s*\\[a-z0-9+]+\*?\s*/i, '').trim();
      if (rest) pending.raw += ' ' + rest;
    }
  }

  flush();
  return verses;
}

function buildVerseRecord({ translationId, translationName, language, license }, v) {
  const testamentTag = v.book.testament === 'OT' ? 'ot' : 'nt';
  const tags = [testamentTag, v.book.section, 'public-domain'].filter(Boolean);
  const id = `${translationId}:${v.book.osis}.${v.chapter}.${v.verse}`;
  const text_for_embed = `${v.book.name} ${v.chapter}:${v.verse} — ${v.text}`;

  return {
    id,
    text: v.text,
    text_for_embed,
    tags,
    meta: {
      translation_id: translationId,
      translation_name: translationName,
      language,
      license: license || 'public-domain',
      testament: v.book.testament,
      book_osis: v.book.osis,
      book_name: v.book.name,
      book_num: v.book.num,
      chapter: v.chapter,
      verse: v.verse,
      canon: 'protestant-66',
      strongs: v.strongs,
    },
  };
}

module.exports = { cleanVerseText, parseUsfmBook, buildVerseRecord };
