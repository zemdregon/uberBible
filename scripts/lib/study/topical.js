'use strict';

const fs = require('fs');
const path = require('path');
const { buildStudyRecord, parseVerseRef, slugify, expandRefToken } = require('./refs');

function parseCsv(content) {
  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  while (i < content.length) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x.length)) rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function extractRefsFromNaveEntry(entry) {
  const refs = [];
  // Patterns like EXO 6:16-20; JOS 21:4,10; 1CH 6:2,3
  const re = /\b([1-3]?[A-Z]{2,4})\s+(\d+:\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;
  let m;
  while ((m = re.exec(entry))) {
    const book = m[1];
    const parts = m[2].split(',');
    for (const part of parts) {
      const range = part.trim();
      const rm = /^(\d+):(\d+)(?:-(\d+))?$/.exec(range);
      if (!rm) continue;
      const ch = rm[1];
      const v1 = Number(rm[2]);
      const v2 = rm[3] ? Number(rm[3]) : v1;
      for (let v = v1; v <= Math.min(v2, v1 + 20); v++) {
        const osis = parseVerseRef(`${book} ${ch}:${v}`);
        if (osis) refs.push(osis);
      }
    }
  }
  return [...new Set(refs)].slice(0, 80);
}

function normalizeNave(work, sourceDir) {
  const file = path.join(sourceDir, 'NavesTopicalDictionary.csv');
  if (!fs.existsSync(file)) throw new Error('NavesTopicalDictionary.csv missing');
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.toLowerCase());
  const iSection = header.indexOf('section');
  const iSubject = header.indexOf('subject');
  const iEntry = header.indexOf('entry');
  const records = [];
  for (const row of rows.slice(1)) {
    const subject = (row[iSubject] || '').trim();
    const entry = (row[iEntry] || '').trim();
    if (!subject || !entry) continue;
    const refs = extractRefsFromNaveEntry(entry);
    const key = slugify(subject);
    records.push(
      buildStudyRecord({
        work,
        entryKey: key,
        text: `${subject}\n${entry}`,
        textForEmbed: `Nave's topic ${subject}: ${entry.replace(/\s+/g, ' ').slice(0, 600)}`,
        refs,
        extraMeta: { subject, section: row[iSection] || '' },
      })
    );
  }
  return records;
}

function normalizeTorrey(work, sourceDir) {
  const file = path.join(sourceDir, 'ttt.txt');
  if (!fs.existsSync(file)) throw new Error('ttt.txt missing');
  const text = fs.readFileSync(file, 'utf8');
  // Strip CCEL header
  const bodyStart = text.search(/\n {3}Access to God\n/);
  const body = bodyStart >= 0 ? text.slice(bodyStart) : text;
  const lines = body.split(/\r?\n/);
  const topics = [];
  let current = null;
  for (const line of lines) {
    // Topic titles are indented with 3 spaces and no leading spaces in continuation markers
    if (/^ {3}[A-Z]/.test(line) && !/^ {10}/.test(line)) {
      const title = line.trim();
      // Skip if looks like a bullet continuation of Exemplified
      if (/^(Moses|Abraham|David)\.?$/.test(title)) {
        if (current) current.lines.push(line.trim());
        continue;
      }
      if (current) topics.push(current);
      current = { title, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) topics.push(current);

  const records = [];
  for (const t of topics) {
    const content = t.lines.join('\n').replace(/[ \t]+\n/g, '\n').trim();
    if (!content) continue;
    const refs = [];
    const refRe = /\b([1-3]?[A-Za-z]{1,5})\s+(\d+:\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)*)/g;
    let m;
    while ((m = refRe.exec(content))) {
      const book = m[1];
      // skip words like "See"
      if (['See', 'Is', 'Of', 'In', 'To', 'A', 'The'].includes(book)) continue;
      for (const part of m[2].split(',')) {
        const p = part.trim();
        const rm = /^(\d+):(\d+)/.exec(p);
        if (!rm) continue;
        const osis = parseVerseRef(`${book} ${rm[1]}:${rm[2]}`);
        if (osis) refs.push(osis);
      }
    }
    const key = slugify(t.title);
    records.push(
      buildStudyRecord({
        work,
        entryKey: key,
        text: `${t.title}\n${content}`,
        textForEmbed: `Torrey topic ${t.title}: ${content.replace(/\s+/g, ' ').slice(0, 600)}`,
        refs: [...new Set(refs)].slice(0, 80),
        extraMeta: { subject: t.title },
      })
    );
  }
  return records;
}

module.exports = { normalizeNave, normalizeTorrey, parseCsv };
