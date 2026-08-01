'use strict';

const fs = require('fs');
const path = require('path');
const { buildStudyRecord, expandRefToken, parseVerseRef } = require('./refs');

function normalizeOpenBibleCrossrefs(work, sourceDir) {
  const file = path.join(sourceDir, 'cross_references.txt');
  if (!fs.existsSync(file)) throw new Error('cross_references.txt missing');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  /** @type {Map<string, {to: string, votes: number}[]>} */
  const byFrom = new Map();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('From Verse') || line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols.length < 2) continue;
    const fromRefs = expandRefToken(cols[0]);
    const toRefs = expandRefToken(cols[1]);
    const votes = cols[2] ? Number(cols[2]) : 0;
    if (!fromRefs.length || !toRefs.length) continue;
    for (const from of fromRefs) {
      if (!byFrom.has(from)) byFrom.set(from, []);
      const list = byFrom.get(from);
      for (const to of toRefs) {
        if (to === from) continue;
        list.push({ to, votes: Number.isFinite(votes) ? votes : 0 });
      }
    }
  }

  const records = [];
  for (const [from, targets] of byFrom) {
    // dedupe by to, keep max votes
    const best = new Map();
    for (const t of targets) {
      const prev = best.get(t.to);
      if (!prev || t.votes > prev.votes) best.set(t.to, t);
    }
    const sorted = [...best.values()].sort((a, b) => b.votes - a.votes);
    const top = sorted.slice(0, 40);
    const text = top.map((t) => (t.votes ? `${t.to} (${t.votes})` : t.to)).join('; ');
    records.push(
      buildStudyRecord({
        work,
        entryKey: from,
        text: `Cross-references for ${from}: ${text}`,
        textForEmbed: `Bible cross-references for ${from}: ${top.map((t) => t.to).join(', ')}`,
        refs: [from, ...top.map((t) => t.to)],
        extraMeta: {
          from_ref: from,
          targets: top,
          target_count: sorted.length,
        },
      })
    );
  }
  return records;
}

module.exports = { normalizeOpenBibleCrossrefs, parseVerseRef };
