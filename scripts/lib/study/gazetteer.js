'use strict';

const fs = require('fs');
const path = require('path');
const { buildStudyRecord, parseVerseRef, slugify } = require('./refs');
const { parseCsv } = require('./topical');

function normalizeOpenBibleGeo(work, sourceDir) {
  const records = [];
  for (const layer of ['ancient', 'modern']) {
    const file = path.join(sourceDir, `${layer}.jsonl`);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\n/).filter(Boolean);
    for (const line of lines) {
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      const name = obj.friendly_id || obj.url_slug || obj.id;
      const types = Array.isArray(obj.types) ? obj.types.join(', ') : '';
      const refs = [];
      for (const v of obj.verses || []) {
        if (v.osis && parseVerseRef(v.osis.replace(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/, (_, a, b, c) => `${a}.${b}.${c}`))) {
          refs.push(v.osis);
        } else if (v.osis) refs.push(v.osis);
      }
      // also from extra.osises
      try {
        const extra = typeof obj.extra === 'string' ? JSON.parse(obj.extra) : obj.extra;
        for (const o of (extra && extra.osises) || []) {
          if (o && !refs.includes(o)) refs.push(o);
        }
      } catch {
        /* ignore */
      }
      const comment = obj.comment || '';
      const lonlat =
        (obj.identifications &&
          obj.identifications[0] &&
          obj.identifications[0].resolutions &&
          obj.identifications[0].resolutions[0] &&
          obj.identifications[0].resolutions[0].lonlat) ||
        '';
      const text = [name, types, comment, lonlat ? `coords ${lonlat}` : '', refs.length ? `refs: ${refs.slice(0, 12).join(', ')}` : '']
        .filter(Boolean)
        .join(' — ');
      records.push(
        buildStudyRecord({
          work,
          entryKey: `${layer}:${obj.id || slugify(name)}`,
          text,
          textForEmbed: `Bible place (${layer}): ${name}${types ? ` (${types})` : ''}. ${comment}`.trim(),
          refs: refs.slice(0, 40),
          extraMeta: {
            layer,
            place_id: obj.id,
            name,
            types: obj.types || [],
            lonlat,
            url_slug: obj.url_slug || '',
          },
        })
      );
    }
  }
  return records;
}

function normalizeBradyPeople(work, sourceDir) {
  const personFile = path.join(sourceDir, 'BibleData-Person.csv');
  const verseFile = path.join(sourceDir, 'BibleData-PersonVerse.csv');
  if (!fs.existsSync(personFile)) throw new Error('BibleData-Person.csv missing');
  const people = parseCsv(fs.readFileSync(personFile, 'utf8'));
  const header = people[0];
  const rows = people.slice(1);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const versesByPerson = new Map();
  if (fs.existsSync(verseFile)) {
    const vrows = parseCsv(fs.readFileSync(verseFile, 'utf8'));
    const vh = vrows[0];
    const vi = Object.fromEntries(vh.map((h, i) => [h, i]));
    for (const r of vrows.slice(1)) {
      const pid = r[vi.person_id];
      const ref = r[vi.reference_id];
      const osis = parseVerseRef(ref);
      if (!pid || !osis) continue;
      if (!versesByPerson.has(pid)) versesByPerson.set(pid, []);
      versesByPerson.get(pid).push(osis);
    }
  }

  const records = [];
  for (const r of rows) {
    const id = r[idx.person_id];
    const name = r[idx.person_name];
    if (!id || !name) continue;
    const notes = r[idx.person_notes] || r[idx.unique_attribute] || '';
    const sex = r[idx.sex] || '';
    const tribe = r[idx.tribe] || '';
    const refs = [...new Set(versesByPerson.get(id) || [])].slice(0, 40);
    const text = [name, sex, tribe, notes, refs.length ? `verses: ${refs.slice(0, 10).join(', ')}` : '']
      .filter(Boolean)
      .join(' — ');
    records.push(
      buildStudyRecord({
        work,
        entryKey: id,
        text,
        textForEmbed: `Bible person ${name}: ${notes || text}`,
        refs,
        extraMeta: { name, sex, tribe, person_id: id },
      })
    );
  }
  return records;
}

function normalizeBradyPlaces(work, sourceDir) {
  const placeFile = path.join(sourceDir, 'BibleData-Place.csv');
  const verseFile = path.join(sourceDir, 'BibleData-PlaceVerse.csv');
  if (!fs.existsSync(placeFile)) throw new Error('BibleData-Place.csv missing');
  const places = parseCsv(fs.readFileSync(placeFile, 'utf8'));
  const header = places[0];
  const rows = places.slice(1);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const versesByPlace = new Map();
  if (fs.existsSync(verseFile)) {
    const vrows = parseCsv(fs.readFileSync(verseFile, 'utf8'));
    const vh = vrows[0];
    const vi = Object.fromEntries(vh.map((h, i) => [h, i]));
    for (const r of vrows.slice(1)) {
      const pid = r[vi.place_id];
      const ref = r[vi.reference_id];
      const osis = parseVerseRef(ref);
      if (!pid || !osis) continue;
      if (!versesByPlace.has(pid)) versesByPlace.set(pid, []);
      versesByPlace.get(pid).push(osis);
    }
  }

  const records = [];
  for (const r of rows) {
    const id = r[idx.place_id];
    const name = r[idx.place_name];
    if (!id || !name) continue;
    const type = r[idx.place_type] || '';
    const modern = r[idx.modern_equivalent] || '';
    const notes = r[idx.place_notes] || '';
    const refs = [...new Set(versesByPlace.get(id) || [])].slice(0, 40);
    const text = [name, type, modern, notes, refs.length ? `verses: ${refs.slice(0, 10).join(', ')}` : '']
      .filter(Boolean)
      .join(' — ');
    records.push(
      buildStudyRecord({
        work,
        entryKey: id,
        text,
        textForEmbed: `Bible place ${name}: ${notes || text}`,
        refs,
        extraMeta: {
          name,
          place_type: type,
          modern_equivalent: modern,
          place_id: id,
          openbible_id: r[idx.openbible_id] || '',
        },
      })
    );
  }
  return records;
}

module.exports = {
  normalizeOpenBibleGeo,
  normalizeBradyPeople,
  normalizeBradyPlaces,
};
