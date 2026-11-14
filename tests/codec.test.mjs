import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENCODINGS,
  detectEncoding,
  decodeBytes,
  encodeString,
  detectEOL,
  toLF,
  applyEOL,
  countLines,
} from '../assets/codec.js';

const ARABIC = 'المفكرة العربية 123';
const MIXED = 'Hello مرحبا ✅ 😀';

test('detectEncoding: UTF-8 BOM', () => {
  const bytes = encodeString('abc', 'utf-8-bom');
  assert.equal(detectEncoding(bytes).encoding, 'utf-8-bom');
});

test('detectEncoding: UTF-16 LE/BE BOM', () => {
  assert.equal(detectEncoding(encodeString('abc', 'utf-16le')).encoding, 'utf-16le');
  assert.equal(detectEncoding(encodeString('abc', 'utf-16be')).encoding, 'utf-16be');
});

test('detectEncoding: UTF-8 without BOM', () => {
  assert.equal(detectEncoding(encodeString(ARABIC, 'utf-8')).encoding, 'utf-8');
});

test('detectEncoding: UTF-16 heuristic بدون BOM', () => {
  const little = encodeString('hello world', 'utf-16le');
  assert.equal(detectEncoding(little).encoding, 'utf-16le');
});

test('detectEncoding: ANSI fallback لبايتات غير UTF-8', () => {
  const bytes = Uint8Array.from([0xc7, 0xe1, 0xd9, 0xe1]);
  assert.equal(detectEncoding(bytes).encoding, 'windows-1256');
});

test('roundtrip: UTF-8 مع BOM', () => {
  const bytes = encodeString(ARABIC, 'utf-8-bom');
  assert.equal(decodeBytes(bytes, 'utf-8-bom'), ARABIC);
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
});

test('roundtrip: UTF-16 LE/BE مع surrogate pairs', () => {
  for (const encoding of ['utf-16le', 'utf-16be']) {
    const bytes = encodeString(MIXED, encoding);
    assert.equal(decodeBytes(bytes, encoding), MIXED);
  }
});

test('roundtrip: ANSI Windows-1256 للعربية', () => {
  const bytes = encodeString(ARABIC, 'windows-1256');
  assert.equal(decodeBytes(bytes, 'windows-1256'), ARABIC);
});

test('roundtrip: ANSI Windows-1252 للنص اللاتيني', () => {
  const text = 'Café déjà vu 90€';
  const bytes = encodeString(text, 'windows-1252');
  assert.equal(decodeBytes(bytes, 'windows-1252'), text);
});

test('ASCII يعمل في كل الترميزات', () => {
  const text = 'plain ascii 123';
  for (const { id } of ENCODINGS) {
    assert.equal(decodeBytes(encodeString(text, id), id), text, id);
  }
});

test('detectEOL و applyEOL', () => {
  assert.equal(detectEOL('a\r\nb\r\n'), 'crlf');
  assert.equal(detectEOL('a\nb\n'), 'lf');
  assert.equal(detectEOL('a\rb\r'), 'cr');
  assert.equal(applyEOL('a\nb', 'crlf'), 'a\r\nb');
  assert.equal(applyEOL('a\r\nb', 'lf'), 'a\nb');
  assert.equal(applyEOL('a\rb', 'crlf'), 'a\r\nb');
});

test('toLF و countLines', () => {
  assert.equal(toLF('a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(countLines(''), 1);
  assert.equal(countLines('a\nb\nc'), 3);
});
