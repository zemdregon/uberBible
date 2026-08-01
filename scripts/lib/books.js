'use strict';

/** USFM \id / filename codes → OSIS, English name, Protestant book number, section tag */
const BOOKS = {
  GEN: { osis: 'Gen', name: 'Genesis', num: 1, testament: 'OT', section: 'pentateuch' },
  EXO: { osis: 'Exod', name: 'Exodus', num: 2, testament: 'OT', section: 'pentateuch' },
  LEV: { osis: 'Lev', name: 'Leviticus', num: 3, testament: 'OT', section: 'pentateuch' },
  NUM: { osis: 'Num', name: 'Numbers', num: 4, testament: 'OT', section: 'pentateuch' },
  DEU: { osis: 'Deut', name: 'Deuteronomy', num: 5, testament: 'OT', section: 'pentateuch' },
  JOS: { osis: 'Josh', name: 'Joshua', num: 6, testament: 'OT', section: 'historical' },
  JDG: { osis: 'Judg', name: 'Judges', num: 7, testament: 'OT', section: 'historical' },
  RUT: { osis: 'Ruth', name: 'Ruth', num: 8, testament: 'OT', section: 'historical' },
  '1SA': { osis: '1Sam', name: '1 Samuel', num: 9, testament: 'OT', section: 'historical' },
  '2SA': { osis: '2Sam', name: '2 Samuel', num: 10, testament: 'OT', section: 'historical' },
  '1KI': { osis: '1Kgs', name: '1 Kings', num: 11, testament: 'OT', section: 'historical' },
  '2KI': { osis: '2Kgs', name: '2 Kings', num: 12, testament: 'OT', section: 'historical' },
  '1CH': { osis: '1Chr', name: '1 Chronicles', num: 13, testament: 'OT', section: 'historical' },
  '2CH': { osis: '2Chr', name: '2 Chronicles', num: 14, testament: 'OT', section: 'historical' },
  EZR: { osis: 'Ezra', name: 'Ezra', num: 15, testament: 'OT', section: 'historical' },
  NEH: { osis: 'Neh', name: 'Nehemiah', num: 16, testament: 'OT', section: 'historical' },
  EST: { osis: 'Esth', name: 'Esther', num: 17, testament: 'OT', section: 'historical' },
  JOB: { osis: 'Job', name: 'Job', num: 18, testament: 'OT', section: 'wisdom' },
  PSA: { osis: 'Ps', name: 'Psalms', num: 19, testament: 'OT', section: 'wisdom' },
  PRO: { osis: 'Prov', name: 'Proverbs', num: 20, testament: 'OT', section: 'wisdom' },
  ECC: { osis: 'Eccl', name: 'Ecclesiastes', num: 21, testament: 'OT', section: 'wisdom' },
  SNG: { osis: 'Song', name: 'Song of Solomon', num: 22, testament: 'OT', section: 'wisdom' },
  ISA: { osis: 'Isa', name: 'Isaiah', num: 23, testament: 'OT', section: 'prophets' },
  JER: { osis: 'Jer', name: 'Jeremiah', num: 24, testament: 'OT', section: 'prophets' },
  LAM: { osis: 'Lam', name: 'Lamentations', num: 25, testament: 'OT', section: 'prophets' },
  EZK: { osis: 'Ezek', name: 'Ezekiel', num: 26, testament: 'OT', section: 'prophets' },
  DAN: { osis: 'Dan', name: 'Daniel', num: 27, testament: 'OT', section: 'prophets' },
  HOS: { osis: 'Hos', name: 'Hosea', num: 28, testament: 'OT', section: 'prophets' },
  JOL: { osis: 'Joel', name: 'Joel', num: 29, testament: 'OT', section: 'prophets' },
  AMO: { osis: 'Amos', name: 'Amos', num: 30, testament: 'OT', section: 'prophets' },
  OBA: { osis: 'Obad', name: 'Obadiah', num: 31, testament: 'OT', section: 'prophets' },
  JON: { osis: 'Jonah', name: 'Jonah', num: 32, testament: 'OT', section: 'prophets' },
  MIC: { osis: 'Mic', name: 'Micah', num: 33, testament: 'OT', section: 'prophets' },
  NAM: { osis: 'Nah', name: 'Nahum', num: 34, testament: 'OT', section: 'prophets' },
  HAB: { osis: 'Hab', name: 'Habakkuk', num: 35, testament: 'OT', section: 'prophets' },
  ZEP: { osis: 'Zeph', name: 'Zephaniah', num: 36, testament: 'OT', section: 'prophets' },
  HAG: { osis: 'Hag', name: 'Haggai', num: 37, testament: 'OT', section: 'prophets' },
  ZEC: { osis: 'Zech', name: 'Zechariah', num: 38, testament: 'OT', section: 'prophets' },
  MAL: { osis: 'Mal', name: 'Malachi', num: 39, testament: 'OT', section: 'prophets' },
  MAT: { osis: 'Matt', name: 'Matthew', num: 40, testament: 'NT', section: 'gospel' },
  MRK: { osis: 'Mark', name: 'Mark', num: 41, testament: 'NT', section: 'gospel' },
  LUK: { osis: 'Luke', name: 'Luke', num: 42, testament: 'NT', section: 'gospel' },
  JHN: { osis: 'John', name: 'John', num: 43, testament: 'NT', section: 'gospel' },
  ACT: { osis: 'Acts', name: 'Acts', num: 44, testament: 'NT', section: 'history' },
  ROM: { osis: 'Rom', name: 'Romans', num: 45, testament: 'NT', section: 'epistle' },
  '1CO': { osis: '1Cor', name: '1 Corinthians', num: 46, testament: 'NT', section: 'epistle' },
  '2CO': { osis: '2Cor', name: '2 Corinthians', num: 47, testament: 'NT', section: 'epistle' },
  GAL: { osis: 'Gal', name: 'Galatians', num: 48, testament: 'NT', section: 'epistle' },
  EPH: { osis: 'Eph', name: 'Ephesians', num: 49, testament: 'NT', section: 'epistle' },
  PHP: { osis: 'Phil', name: 'Philippians', num: 50, testament: 'NT', section: 'epistle' },
  COL: { osis: 'Col', name: 'Colossians', num: 51, testament: 'NT', section: 'epistle' },
  '1TH': { osis: '1Thess', name: '1 Thessalonians', num: 52, testament: 'NT', section: 'epistle' },
  '2TH': { osis: '2Thess', name: '2 Thessalonians', num: 53, testament: 'NT', section: 'epistle' },
  '1TI': { osis: '1Tim', name: '1 Timothy', num: 54, testament: 'NT', section: 'epistle' },
  '2TI': { osis: '2Tim', name: '2 Timothy', num: 55, testament: 'NT', section: 'epistle' },
  TIT: { osis: 'Titus', name: 'Titus', num: 56, testament: 'NT', section: 'epistle' },
  PHM: { osis: 'Phlm', name: 'Philemon', num: 57, testament: 'NT', section: 'epistle' },
  HEB: { osis: 'Heb', name: 'Hebrews', num: 58, testament: 'NT', section: 'epistle' },
  JAS: { osis: 'Jas', name: 'James', num: 59, testament: 'NT', section: 'epistle' },
  '1PE': { osis: '1Pet', name: '1 Peter', num: 60, testament: 'NT', section: 'epistle' },
  '2PE': { osis: '2Pet', name: '2 Peter', num: 61, testament: 'NT', section: 'epistle' },
  '1JN': { osis: '1John', name: '1 John', num: 62, testament: 'NT', section: 'epistle' },
  '2JN': { osis: '2John', name: '2 John', num: 63, testament: 'NT', section: 'epistle' },
  '3JN': { osis: '3John', name: '3 John', num: 64, testament: 'NT', section: 'epistle' },
  JUD: { osis: 'Jude', name: 'Jude', num: 65, testament: 'NT', section: 'epistle' },
  REV: { osis: 'Rev', name: 'Revelation', num: 66, testament: 'NT', section: 'apocalyptic' },
};

/** Alternate USFM ids sometimes seen in eBible / LXX / DC files */
const ALIASES = {
  PS: 'PSA',
  PSS: 'PSA',
  PRV: 'PRO',
  ECCLE: 'ECC',
  SOS: 'SNG',
  CAN: 'SNG',
  EZE: 'EZK',
  JOEL: 'JOL',
  NAH: 'NAM',
  ZEP: 'ZEP',
  TOB: null,
  JDT: null,
  WIS: null,
  SIR: null,
  BAR: null,
  '1MA': null,
  '2MA': null,
  ESG: 'EST',
  DAG: 'DAN',
};

function resolveBook(code) {
  if (!code) return null;
  const raw = String(code).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(ALIASES, raw)) {
    const mapped = ALIASES[raw];
    if (mapped == null) return null;
    return BOOKS[mapped] ? { code: mapped, ...BOOKS[mapped] } : null;
  }
  if (BOOKS[raw]) return { code: raw, ...BOOKS[raw] };
  return null;
}

function languageHint(translationId, catalogLang) {
  if (catalogLang) {
    const l = catalogLang.toLowerCase();
    if (l.startsWith('english')) return 'en';
    if (l.startsWith('hebrew')) return 'he';
    if (l.startsWith('greek')) return 'grc';
    if (l.startsWith('german')) return 'de';
    if (l.startsWith('french')) return 'fr';
    if (l.startsWith('spanish')) return 'es';
    if (l.startsWith('portuguese')) return 'pt';
    if (l.startsWith('chinese')) return 'zh';
    if (l.startsWith('arabic')) return 'ar';
    if (l.startsWith('russian')) return 'ru';
    if (l.startsWith('latin')) return 'la';
    if (l.startsWith('coptic')) return 'cop';
  }
  const id = translationId || '';
  if (id.startsWith('eng')) return 'en';
  if (id.startsWith('hbo') || id.startsWith('heb')) return 'he';
  if (id.startsWith('grc')) return 'grc';
  if (id.startsWith('deu')) return 'de';
  if (id.startsWith('fra') || id.startsWith('fr')) return 'fr';
  if (id.startsWith('spa')) return 'es';
  if (id.startsWith('por')) return 'pt';
  if (id.startsWith('cmn') || id.startsWith('zho')) return 'zh';
  if (id.startsWith('arb')) return 'ar';
  if (id.startsWith('rus')) return 'ru';
  if (id.startsWith('cop')) return 'cop';
  return 'und';
}

module.exports = { BOOKS, resolveBook, languageHint };
