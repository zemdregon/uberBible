'use strict';

const fs = require('fs');
const path = require('path');
const { buildStudyRecord } = require('./refs');

/** Parse Open Scriptures Strong's .dat (Online Bible style). */
function parseStrongsDat(content, prefix) {
  const entries = [];
  const blocks = content.split(/^\$\$T/m).slice(1);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const numLine = lines[0] || '';
    const num = parseInt(numLine.replace(/\D/g, ''), 10);
    if (!Number.isFinite(num) || num <= 0) continue;
    // Find \NNNNN\ header
    let i = 1;
    while (i < lines.length && !/^\\\d+\\/.test(lines[i].trim())) i++;
    if (i >= lines.length) continue;
    i++;
    // lemma line: "1  'ab  awb"
    const lemmaLine = (lines[i] || '').trim();
    i++;
    const parts = lemmaLine.split(/\s+/).filter(Boolean);
    const strongNum = parts[0] || String(num);
    const lemma = parts[1] || '';
    const translit = parts.slice(2).join(' ');
    const body = lines
      .slice(i)
      .join('\n')
      .replace(/\nsee (HEBREW|GREEK) for[^\n]*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = `${prefix}${Number(strongNum)}`;
    const text = [lemma, translit, body].filter(Boolean).join(' — ');
    entries.push({ key, lemma, translit, body, text });
  }
  return entries;
}

function normalizeStrongsDat(work, sourceDir) {
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.dat'));
  if (!files.length) throw new Error(`No .dat in ${sourceDir}`);
  const prefix = work.id.includes('greek') ? 'G' : 'H';
  const content = fs.readFileSync(path.join(sourceDir, files[0]), 'utf8');
  const entries = parseStrongsDat(content, prefix);
  return entries.map((e) =>
    buildStudyRecord({
      work,
      entryKey: e.key,
      text: e.text,
      textForEmbed: `Strong's ${e.key}${e.lemma ? ` (${e.lemma})` : ''} — ${e.body || e.text}`,
      extraMeta: { lemma: e.lemma, transliteration: e.translit, script: prefix === 'G' ? 'grc' : 'he' },
    })
  );
}

function stripXmlTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHebrewLexiconXml(work, sourceDir) {
  const records = [];
  const strongPath = path.join(sourceDir, 'HebrewStrong.xml');
  if (fs.existsSync(strongPath)) {
    const xml = fs.readFileSync(strongPath, 'utf8');
    const re = /<entry\s+id="(H\d+)">([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = re.exec(xml))) {
      const key = m[1];
      const body = m[2];
      const w = /<w\b([^>]*)>([^<]*)<\/w>/.exec(body);
      const lemma = w ? w[2] : '';
      const attrs = w ? w[1] : '';
      const xlit = /xlit="([^"]*)"/.exec(attrs);
      const pron = /pron="([^"]*)"/.exec(attrs);
      const meaning = stripXmlTags((/ <meaning>([\s\S]*?)<\/meaning>/.exec(body) || [])[1]);
      const usage = stripXmlTags((/<usage>([\s\S]*?)<\/usage>/.exec(body) || [])[1]);
      const source = stripXmlTags((/<source>([\s\S]*?)<\/source>/.exec(body) || [])[1]);
      const text = [lemma, xlit && xlit[1], meaning || usage, source].filter(Boolean).join(' — ');
      records.push(
        buildStudyRecord({
          work,
          entryKey: key,
          text,
          textForEmbed: `OSHB Hebrew Lexicon ${key}${lemma ? ` (${lemma})` : ''} — ${meaning || usage || text}`,
          extraMeta: {
            lemma,
            transliteration: (xlit && xlit[1]) || '',
            pronunciation: (pron && pron[1]) || '',
            usage,
            source_note: source,
            lexicon: 'hebrew-strong',
            script: 'he',
          },
        })
      );
    }
  }
  return records;
}

/** STEPBible TBESH / TBESG tab-separated rows after header. */
function normalizeTbe(work, sourceDir) {
  const file = fs.readdirSync(sourceDir).find((f) => f.endsWith('.txt'));
  if (!file) throw new Error(`No .txt for ${work.id}`);
  const lines = fs.readFileSync(path.join(sourceDir, file), 'utf8').split(/\r?\n/);
  const records = [];
  const seen = new Set();
  for (const line of lines) {
    if (!/^[HG]\d/.test(line)) continue;
    const cols = line.split('\t');
    if (cols.length < 6) continue;
    const dStrong = cols[1] || cols[0];
    const key = dStrong.replace(/[^HG0-9A-Za-z]/g, '') || cols[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const lemma = cols[3] || '';
    const translit = cols[4] || '';
    const gloss = (cols[5] || '').replace(/<BR>/gi, '; ').replace(/<[^>]+>/g, '');
    const def = (cols[6] || cols.slice(6).join(' ') || '').replace(/<BR>/gi, '\n').replace(/<[^>]+>/g, '');
    const text = [lemma, translit, gloss, def].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    records.push(
      buildStudyRecord({
        work,
        entryKey: key,
        text,
        textForEmbed: `${work.id.toUpperCase()} ${key}${lemma ? ` (${lemma})` : ''} — ${gloss || def || text}`,
        extraMeta: {
          lemma,
          transliteration: translit,
          gloss,
          eStrong: cols[0],
          dStrong,
          script: work.id === 'tbesg' ? 'grc' : 'he',
        },
      })
    );
  }
  return records;
}

module.exports = {
  normalizeStrongsDat,
  normalizeHebrewLexiconXml,
  normalizeTbe,
};
