'use strict';

const fs = require('fs');
const path = require('path');
const { buildStudyRecord, parseVerseRef, slugify } = require('./refs');

function normalizeNeuuDictionary(work, sourceDir) {
  const dir = path.join(sourceDir, 'entries');
  if (!fs.existsSync(dir)) throw new Error(`entries/ missing for ${work.id}`);
  const records = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [name, entry] of Object.entries(data)) {
      const textBody =
        entry.text ||
        entry.definition ||
        (Array.isArray(entry.definitions)
          ? entry.definitions.map((d) => d.text || d).join('\n\n')
          : '') ||
        '';
      const refs = [];
      const rawRefs = entry.scripture_refs || entry.refs || [];
      for (const r of rawRefs) {
        const raw = typeof r === 'string' ? r : r.reference || r.original;
        const osis = parseVerseRef(raw);
        if (osis) refs.push(osis);
      }
      const key = slugify(entry.slug || name);
      const text = String(textBody).trim();
      if (!text) continue;
      records.push(
        buildStudyRecord({
          work,
          entryKey: key,
          text: `${name} — ${text}`,
          textForEmbed: `${work.title}: ${name} — ${text.slice(0, 500)}`,
          refs,
          extraMeta: { headword: name, letter: file.replace(/\.json$/, '') },
        })
      );
    }
  }
  return records;
}

module.exports = { normalizeNeuuDictionary };
