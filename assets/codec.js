/*
 * codec.js — ترميزات النصوص ونهايات الأسطر (منطق نقي قابل للاختبار في Node والمتصفح).
 * الترميزات: UTF-8، UTF-8 مع BOM، UTF-16 LE/BE، ANSI (Windows-1256 / Windows-1252).
 */

export const ENCODINGS = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'utf-8-bom', label: 'UTF-8 مع BOM' },
  { id: 'utf-16le', label: 'UTF-16 LE' },
  { id: 'utf-16be', label: 'UTF-16 BE' },
  { id: 'windows-1256', label: 'ANSI (Windows-1256)' },
  { id: 'windows-1252', label: 'ANSI (Windows-1252)' },
];

export const EOLS = [
  { id: 'crlf', label: 'Windows (CRLF)' },
  { id: 'lf', label: 'Unix (LF)' },
  { id: 'cr', label: 'Macintosh (CR)' },
];

export const encodingLabel = (id) => (ENCODINGS.find((e) => e.id === id) || ENCODINGS[0]).label;

const BOM_UTF8 = [0xef, 0xbb, 0xbf];

function startsWithBytes(bytes, pattern) {
  if (bytes.length < pattern.length) return false;
  for (let i = 0; i < pattern.length; i += 1) if (bytes[i] !== pattern[i]) return false;
  return true;
}

function stripPrefix(bytes, count) {
  return bytes.length >= count ? bytes.subarray(count) : bytes;
}

/** كشف الترميز من البايتات: BOM أولاً، ثم UTF-8 صارم، ثم ANSI، مع استدلال UTF-16 بلا BOM. */
export function detectEncoding(bytes) {
  if (startsWithBytes(bytes, BOM_UTF8)) return { encoding: 'utf-8-bom', bom: true };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: 'utf-16le', bom: true };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: 'utf-16be', bom: true };

  const sample = Math.min(bytes.length, 4096);
  if (sample >= 4) {
    let evenNul = 0;
    let oddNul = 0;
    for (let i = 0; i < sample; i += 1) {
      if (bytes[i] === 0) {
        if (i % 2 === 0) evenNul += 1;
        else oddNul += 1;
      }
    }
    const nulRatio = (evenNul + oddNul) / sample;
    if (nulRatio > 0.2) {
      if (oddNul > evenNul * 3) return { encoding: 'utf-16le', bom: false, heuristic: true };
      if (evenNul > oddNul * 3) return { encoding: 'utf-16be', bom: false, heuristic: true };
    }
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { encoding: 'utf-8', bom: false };
  } catch {
    return { encoding: 'windows-1256', bom: false, fallback: true };
  }
}

function decodeUtf16(bytes, littleEndian) {
  const units = new Uint16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < units.length; i += 1) {
    const a = bytes[i * 2];
    const b = bytes[i * 2 + 1];
    units[i] = littleEndian ? a | (b << 8) : (a << 8) | b;
  }
  let out = '';
  const CHUNK = 8192;
  for (let i = 0; i < units.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, units.subarray(i, i + CHUNK));
  }
  return out;
}

function encodeUtf16(text, littleEndian) {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const hi = (code >> 8) & 0xff;
    const lo = code & 0xff;
    out[i * 2] = littleEndian ? lo : hi;
    out[i * 2 + 1] = littleEndian ? hi : lo;
  }
  return out;
}

const ansiTables = new Map();

function ansiReverseTable(encoding) {
  if (ansiTables.has(encoding)) return ansiTables.get(encoding);
  const decoder = new TextDecoder(encoding);
  const table = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    const ch = decoder.decode(new Uint8Array([byte]));
    if (ch && ch !== '\uFFFD' && !table.has(ch)) table.set(ch, byte);
  }
  ansiTables.set(encoding, table);
  return table;
}

/** فك بايتات إلى نص حسب الترميز المحدد. */
export function decodeBytes(bytes, encoding = 'utf-8') {
  switch (encoding) {
    case 'utf-8-bom':
      return new TextDecoder('utf-8').decode(stripPrefix(bytes, 3));
    case 'utf-16le':
      return decodeUtf16(stripPrefix(bytes, startsWithBytes(bytes, [0xff, 0xfe]) ? 2 : 0), true);
    case 'utf-16be':
      return decodeUtf16(stripPrefix(bytes, startsWithBytes(bytes, [0xfe, 0xff]) ? 2 : 0), false);
    case 'windows-1256':
    case 'windows-1252':
      return new TextDecoder(encoding).decode(bytes);
    case 'utf-8':
    default:
      return new TextDecoder('utf-8').decode(bytes);
  }
}

/** ترميز نص إلى بايتات حسب الترميز المحدد. */
export function encodeString(text, encoding = 'utf-8') {
  switch (encoding) {
    case 'utf-8':
      return new TextEncoder().encode(text);
    case 'utf-8-bom': {
      const body = new TextEncoder().encode(text);
      const out = new Uint8Array(body.length + 3);
      out.set(BOM_UTF8, 0);
      out.set(body, 3);
      return out;
    }
    case 'utf-16le':
      return encodeUtf16(text, true);
    case 'utf-16be':
      return encodeUtf16(text, false);
    case 'windows-1256':
    case 'windows-1252': {
      const table = ansiReverseTable(encoding);
      const out = [];
      for (const ch of text) {
        if (table.has(ch)) {
          out.push(table.get(ch));
        } else {
          const code = ch.codePointAt(0);
          out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
        }
      }
      return Uint8Array.from(out);
    }
    default:
      return new TextEncoder().encode(text);
  }
}

/** كشف نهاية السطر الغالبة. */
export function detectEOL(text) {
  const totalLf = (text.match(/\n/g) || []).length;
  const totalCr = (text.match(/\r/g) || []).length;
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = totalLf - crlf;
  const cr = totalCr - crlf;
  if (crlf + lf + cr === 0) return 'crlf';
  if (crlf >= lf && crlf >= cr) return 'crlf';
  if (cr > lf) return 'cr';
  return 'lf';
}

/** توحيد كل نهايات الأسطر إلى LF للتحرير. */
export function toLF(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** تطبيق نهاية السطر المطلوبة. */
export function applyEOL(text, eol = 'crlf') {
  const normalized = toLF(text);
  const eolText = eol === 'crlf' ? '\r\n' : eol === 'lf' ? '\n' : '\r';
  return normalized.replace(/\n/g, eolText);
}

/** عدد الأسطر في نص موحّد. */
export function countLines(text) {
  if (text.length === 0) return 1;
  return text.split('\n').length;
}
