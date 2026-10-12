// Turn a scripture reference ("James 1:2-3", "1 Jn 4", "Ps. 23:1") into links
// that open the passage on BibleGateway or YouVersion (bible.com — opens the
// YouVersion app on phones that have it). Nothing is fetched; these are plain
// links. A reference that can't be read returns null, and is shown as text.

// Default translation. BibleGateway takes the short name; YouVersion needs
// its numeric id for the same translation (NIV = 111, KJV = 1, ESV = 59,
// NKJV = 114, NLT = 116).
export const BIBLE_VERSION = { gateway: 'NIV', youversion: 111, label: 'NIV' };

// [USFM code, full name, ...other spellings]. Matching ignores case, dots
// and spaces, so "1 Jn", "1Jn" and "1 john" all work.
const BOOKS = [
  ['GEN', 'Genesis', 'gen', 'ge', 'gn'], ['EXO', 'Exodus', 'exo', 'ex', 'exod'],
  ['LEV', 'Leviticus', 'lev', 'lv'], ['NUM', 'Numbers', 'num', 'nm', 'nb'],
  ['DEU', 'Deuteronomy', 'deut', 'deu', 'dt'], ['JOS', 'Joshua', 'josh', 'jos'],
  ['JDG', 'Judges', 'judg', 'jdg', 'jg'], ['RUT', 'Ruth', 'rut', 'ru'],
  ['1SA', '1 Samuel', '1sam', '1sa', '1sm', 'isamuel'], ['2SA', '2 Samuel', '2sam', '2sa', '2sm', 'iisamuel'],
  ['1KI', '1 Kings', '1kgs', '1ki', '1kin', 'ikings'], ['2KI', '2 Kings', '2kgs', '2ki', '2kin', 'iikings'],
  ['1CH', '1 Chronicles', '1chr', '1ch', '1chron', 'ichronicles'], ['2CH', '2 Chronicles', '2chr', '2ch', '2chron', 'iichronicles'],
  ['EZR', 'Ezra', 'ezr'], ['NEH', 'Nehemiah', 'neh', 'ne'], ['EST', 'Esther', 'esth', 'est', 'es'],
  ['JOB', 'Job', 'jb'], ['PSA', 'Psalms', 'psalm', 'ps', 'psa', 'pss', 'psm'],
  ['PRO', 'Proverbs', 'prov', 'pro', 'prv', 'pr'], ['ECC', 'Ecclesiastes', 'eccl', 'ecc', 'ec', 'qoh'],
  ['SNG', 'Song of Songs', 'songofsolomon', 'song', 'sos', 'sng', 'canticles'],
  ['ISA', 'Isaiah', 'isa', 'is'], ['JER', 'Jeremiah', 'jer', 'je', 'jr'],
  ['LAM', 'Lamentations', 'lam', 'la'], ['EZK', 'Ezekiel', 'ezek', 'eze', 'ezk'],
  ['DAN', 'Daniel', 'dan', 'da', 'dn'], ['HOS', 'Hosea', 'hos', 'ho'], ['JOL', 'Joel', 'joe', 'jl'],
  ['AMO', 'Amos', 'amo', 'am'], ['OBA', 'Obadiah', 'obad', 'oba', 'ob'], ['JON', 'Jonah', 'jon', 'jnh'],
  ['MIC', 'Micah', 'mic', 'mc'], ['NAM', 'Nahum', 'nah', 'nam', 'na'], ['HAB', 'Habakkuk', 'hab', 'hb'],
  ['ZEP', 'Zephaniah', 'zeph', 'zep', 'zp'], ['HAG', 'Haggai', 'hag', 'hg'],
  ['ZEC', 'Zechariah', 'zech', 'zec', 'zc'], ['MAL', 'Malachi', 'mal', 'ml'],
  ['MAT', 'Matthew', 'matt', 'mat', 'mt'], ['MRK', 'Mark', 'mrk', 'mar', 'mk', 'mr'],
  ['LUK', 'Luke', 'luk', 'lk'], ['JHN', 'John', 'jhn', 'jn', 'joh'],
  ['ACT', 'Acts', 'act', 'ac'], ['ROM', 'Romans', 'rom', 'ro', 'rm'],
  ['1CO', '1 Corinthians', '1cor', '1co', 'icorinthians'], ['2CO', '2 Corinthians', '2cor', '2co', 'iicorinthians'],
  ['GAL', 'Galatians', 'gal', 'ga'], ['EPH', 'Ephesians', 'eph', 'ephes'],
  ['PHP', 'Philippians', 'phil', 'php', 'pp'], ['COL', 'Colossians', 'col', 'co'],
  ['1TH', '1 Thessalonians', '1thess', '1th', '1thes', 'ithessalonians'], ['2TH', '2 Thessalonians', '2thess', '2th', '2thes', 'iithessalonians'],
  ['1TI', '1 Timothy', '1tim', '1ti', 'itimothy'], ['2TI', '2 Timothy', '2tim', '2ti', 'iitimothy'],
  ['TIT', 'Titus', 'tit', 'ti'], ['PHM', 'Philemon', 'philem', 'phm', 'pm'],
  ['HEB', 'Hebrews', 'heb'], ['JAS', 'James', 'jas', 'jm'],
  ['1PE', '1 Peter', '1pet', '1pe', '1pt', 'ipeter'], ['2PE', '2 Peter', '2pet', '2pe', '2pt', 'iipeter'],
  ['1JN', '1 John', '1jn', '1jo', '1joh', 'ijohn'], ['2JN', '2 John', '2jn', '2jo', '2joh', 'iijohn'],
  ['3JN', '3 John', '3jn', '3jo', '3joh', 'iiijohn'], ['JUD', 'Jude', 'jud', 'jd'],
  ['REV', 'Revelation', 'rev', 're', 'revelations', 'apocalypse'],
];

const squash = (s) => s.toLowerCase().replace(/[\s.]/g, '');
const LOOKUP = new Map();
for (const [code, name, ...alts] of BOOKS) {
  [name, ...alts].forEach((n) => LOOKUP.set(squash(n), { code, name }));
}

// "James 1:2-3" → { code: 'JAS', name: 'James', chapter: 1, verses: '2-3' }
export function parseReference(ref) {
  if (!ref) return null;
  const m = String(ref).trim().match(/^((?:[1-3]|i{1,3})?\s*[A-Za-z][A-Za-z.\s]*?)\s*(\d+)(?:\s*[:.]\s*(\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*))?/i);
  if (!m) return null;
  const book = LOOKUP.get(squash(m[1]));
  if (!book) return null;
  const verses = m[3] ? m[3].replace(/\s+/g, '').replace(/–/g, '-') : '';
  return { ...book, chapter: Number(m[2]), verses };
}

export function bibleLinks(ref) {
  const p = parseReference(ref);
  if (!p) return null;
  const label = `${p.name} ${p.chapter}${p.verses ? ':' + p.verses : ''}`;
  // YouVersion takes one verse or one range (JAS.1.2-3); for a list like
  // "16,18" use the first part.
  const yvVerses = p.verses ? p.verses.split(',')[0] : '';
  return {
    label,
    gateway: `https://www.biblegateway.com/passage/?search=${encodeURIComponent(label)}&version=${BIBLE_VERSION.gateway}`,
    youversion: `https://www.bible.com/bible/${BIBLE_VERSION.youversion}/${p.code}.${p.chapter}${yvVerses ? '.' + yvVerses : ''}.${BIBLE_VERSION.label}`,
  };
}
