'use strict';

const { BOOKS, resolveBook } = require('../books');

/** OSIS book code → book info */
const BY_OSIS = {};
for (const [code, info] of Object.entries(BOOKS)) {
  BY_OSIS[info.osis.toLowerCase()] = { code, ...info };
  BY_OSIS[info.osis] = { code, ...info };
}

const NAME_ALIASES = {
  genesis: 'Gen',
  exodus: 'Exod',
  leviticus: 'Lev',
  numbers: 'Num',
  deuteronomy: 'Deut',
  joshua: 'Josh',
  judges: 'Judg',
  ruth: 'Ruth',
  '1 samuel': '1Sam',
  '2 samuel': '2Sam',
  '1 kings': '1Kgs',
  '2 kings': '2Kgs',
  '1 chronicles': '1Chr',
  '2 chronicles': '2Chr',
  ezra: 'Ezra',
  nehemiah: 'Neh',
  esther: 'Esth',
  job: 'Job',
  psalm: 'Ps',
  psalms: 'Ps',
  proverb: 'Prov',
  proverbs: 'Prov',
  ecclesiastes: 'Eccl',
  'song of solomon': 'Song',
  'song of songs': 'Song',
  canticles: 'Song',
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
  '1 corinthians': '1Cor',
  '2 corinthians': '2Cor',
  galatians: 'Gal',
  ephesians: 'Eph',
  philippians: 'Phil',
  colossians: 'Col',
  '1 thessalonians': '1Thess',
  '2 thessalonians': '2Thess',
  '1 timothy': '1Tim',
  '2 timothy': '2Tim',
  titus: 'Titus',
  philemon: 'Phlm',
  hebrews: 'Heb',
  james: 'Jas',
  '1 peter': '1Pet',
  '2 peter': '2Pet',
  '1 john': '1John',
  '2 john': '2John',
  '3 john': '3John',
  jude: 'Jude',
  revelation: 'Rev',
  // common abbreviations
  ge: 'Gen',
  gen: 'Gen',
  ex: 'Exod',
  exo: 'Exod',
  exod: 'Exod',
  le: 'Lev',
  lev: 'Lev',
  nu: 'Num',
  num: 'Num',
  de: 'Deut',
  deut: 'Deut',
  jos: 'Josh',
  josh: 'Josh',
  jdg: 'Judg',
  judg: 'Judg',
  ru: 'Ruth',
  '1sa': '1Sam',
  '2sa': '2Sam',
  '1sam': '1Sam',
  '2sam': '2Sam',
  '1ki': '1Kgs',
  '2ki': '2Kgs',
  '1kgs': '1Kgs',
  '2kgs': '2Kgs',
  '1ch': '1Chr',
  '2ch': '2Chr',
  '1chr': '1Chr',
  '2chr': '2Chr',
  ezr: 'Ezra',
  ne: 'Neh',
  neh: 'Neh',
  es: 'Esth',
  esth: 'Esth',
  ps: 'Ps',
  psa: 'Ps',
  pr: 'Prov',
  pro: 'Prov',
  prov: 'Prov',
  ec: 'Eccl',
  ecc: 'Eccl',
  eccl: 'Eccl',
  so: 'Song',
  son: 'Song',
  song: 'Song',
  is: 'Isa',
  isa: 'Isa',
  je: 'Jer',
  jer: 'Jer',
  la: 'Lam',
  lam: 'Lam',
  eze: 'Ezek',
  ezek: 'Ezek',
  da: 'Dan',
  dan: 'Dan',
  ho: 'Hos',
  hos: 'Hos',
  joe: 'Joel',
  joel: 'Joel',
  am: 'Amos',
  amos: 'Amos',
  ob: 'Obad',
  obad: 'Obad',
  jon: 'Jonah',
  jonah: 'Jonah',
  mic: 'Mic',
  na: 'Nah',
  nah: 'Nah',
  hab: 'Hab',
  zep: 'Zeph',
  zeph: 'Zeph',
  hag: 'Hag',
  zec: 'Zech',
  zech: 'Zech',
  mal: 'Mal',
  mt: 'Matt',
  mat: 'Matt',
  matt: 'Matt',
  mk: 'Mark',
  mr: 'Mark',
  mark: 'Mark',
  lk: 'Luke',
  lu: 'Luke',
  luke: 'Luke',
  jn: 'John',
  joh: 'John',
  john: 'John',
  ac: 'Acts',
  acts: 'Acts',
  ro: 'Rom',
  rom: 'Rom',
  '1co': '1Cor',
  '2co': '2Cor',
  '1cor': '1Cor',
  '2cor': '2Cor',
  ga: 'Gal',
  gal: 'Gal',
  eph: 'Eph',
  php: 'Phil',
  phil: 'Phil',
  col: 'Col',
  '1th': '1Thess',
  '2th': '2Thess',
  '1thess': '1Thess',
  '2thess': '2Thess',
  '1ti': '1Tim',
  '2ti': '2Tim',
  '1tim': '1Tim',
  '2tim': '2Tim',
  tit: 'Titus',
  titus: 'Titus',
  phm: 'Phlm',
  phlm: 'Phlm',
  he: 'Heb',
  heb: 'Heb',
  jas: 'Jas',
  jam: 'Jas',
  james: 'Jas',
  '1pe': '1Pet',
  '2pe': '2Pet',
  '1pet': '1Pet',
  '2pet': '2Pet',
  '1jn': '1John',
  '2jn': '2John',
  '3jn': '3John',
  '1john': '1John',
  '2john': '2John',
  '3john': '3John',
  jud: 'Jude',
  jude: 'Jude',
  re: 'Rev',
  rev: 'Rev',
  revelation: 'Rev',
};

function resolveOsisBook(token) {
  if (!token) return null;
  const t = String(token).trim();
  if (BY_OSIS[t]) return BY_OSIS[t];
  if (BY_OSIS[t.toLowerCase()]) return BY_OSIS[t.toLowerCase()];
  const alias = NAME_ALIASES[t.toLowerCase()];
  if (alias && BY_OSIS[alias]) return BY_OSIS[alias];
  const usfm = resolveBook(t);
  if (usfm) return usfm;
  return null;
}

/**
 * Parse a single verse ref into OSIS "Gen.1.1".
 * Accepts: Gen.1.1 | GEN 1:1 | Genesis 1:1 | Ge 1:1
 */
function parseVerseRef(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // OpenBible / OSIS dotted form
  let m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(s);
  if (m) {
    const book = resolveOsisBook(m[1]);
    if (!book) return null;
    return `${book.osis}.${Number(m[2])}.${Number(m[3])}`;
  }
  // USFM-ish: GEN 1:1
  m = /^([1-3]?[A-Za-z]+)\s+(\d+):(\d+)$/.exec(s);
  if (m) {
    const book = resolveOsisBook(m[1]);
    if (!book) return null;
    return `${book.osis}.${Number(m[2])}.${Number(m[3])}`;
  }
  // English name: 1 Corinthians 13:4
  m = /^([1-3]?\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+):(\d+)$/.exec(s);
  if (m) {
    const book = resolveOsisBook(m[1].replace(/\s+/g, ' ').trim());
    if (!book) return null;
    return `${book.osis}.${Number(m[2])}.${Number(m[3])}`;
  }
  return null;
}

/** Expand OpenBible range Gen.1.1-Gen.1.3 or Col.1.16-Col.1.17 → list of OSIS refs (cap). */
function expandRefToken(token, maxExpand = 20) {
  const t = String(token).trim();
  if (!t.includes('-')) {
    const one = parseVerseRef(t);
    return one ? [one] : [];
  }
  const [a, b] = t.split('-');
  const start = parseVerseRef(a);
  const end = parseVerseRef(b);
  if (!start || !end) {
    const one = parseVerseRef(a) || parseVerseRef(b);
    return one ? [one] : [];
  }
  const [sb, sc, sv] = start.split('.');
  const [eb, ec, ev] = end.split('.');
  if (sb !== eb || sc !== ec) return [start, end];
  const out = [];
  const from = Number(sv);
  const to = Number(ev);
  if (to < from || to - from > maxExpand) return [start, end];
  for (let v = from; v <= to; v++) out.push(`${sb}.${sc}.${v}`);
  return out;
}

function licenseTag(license) {
  const l = String(license || '').toLowerCase();
  if (l.includes('public') || l === 'cc0-1.0' || l === 'cc0') return 'public-domain';
  if (l.includes('by-sa')) return 'cc-by-sa';
  if (l.includes('by')) return 'cc-by';
  return 'open-license';
}

function buildStudyRecord({ work, entryKey, text, textForEmbed, refs = [], extraMeta = {} }) {
  const tags = ['study', work.kind, licenseTag(work.license)].filter(Boolean);
  return {
    id: `${work.id}:${entryKey}`,
    text,
    text_for_embed: textForEmbed || text,
    tags,
    meta: {
      work_id: work.id,
      work_title: work.title,
      kind: work.kind,
      license: work.license,
      attribution: work.attribution,
      entry_key: String(entryKey),
      refs,
      language: 'en',
      ...extraMeta,
    },
  };
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'entry';
}

module.exports = {
  BY_OSIS,
  resolveOsisBook,
  parseVerseRef,
  expandRefToken,
  buildStudyRecord,
  licenseTag,
  slugify,
};
