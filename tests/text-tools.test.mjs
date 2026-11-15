import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countWords,
  mergeBrokenLines,
  removeExtraSpaces,
  removeEmptyLines,
  removeDuplicateLines,
  sortLines,
  changeCase,
  CLEANUPS,
} from '../assets/text-tools.js';

test('عدّ الكلمات: عربي وإنجليزي وفارغ', () => {
  assert.equal(countWords('مرحبا بالعالم'), 2);
  assert.equal(countWords('Hello world'), 2);
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n\t '), 0);
  assert.equal(countWords('كلمة'), 1);
});

test('عدّ الكلمات: إيموجي وأسطر', () => {
  assert.equal(countWords('👍🏽 ok'), 1);
  assert.equal(countWords('سطر أول\nسطر ثانٍ'), 4);
});

test('عدّ الكلمات: اليابانية بلا مسافات (مقسّم الكلمات)', () => {
  assert.ok(countWords('吾輩は猫である。名前はまだ無い。', 'ja') > 3);
});

test('دمج الأسطر المقطوعة يحافظ على الفقرات', () => {
  assert.equal(mergeBrokenLines('This is a\nbroken line\n\nNew para'), 'This is a broken line\n\nNew para');
});

test('دمج الأسطر اليابانية بلا مسافة', () => {
  assert.equal(mergeBrokenLines('日本語の\n文章です'), '日本語の文章です');
});

test('إزالة المسافات الزائدة', () => {
  assert.equal(removeExtraSpaces('a  b\t c  '), 'a b c');
  assert.equal(removeExtraSpaces('مرحبا    بالعالم'), 'مرحبا بالعالم');
});

test('إزالة الأسطر الفارغة', () => {
  assert.equal(removeEmptyLines('a\n\nb\n \n\nc'), 'a\nb\nc');
});

test('إزالة الأسطر المكررة تميّز حالة الأحرف', () => {
  assert.equal(removeDuplicateLines('b\na\nb\nA'), 'b\na\nA');
});

test('ترتيب الأسطر ترتيباً طبيعياً', () => {
  assert.equal(sortLines('item 10\nApple\nitem 2'), 'Apple\nitem 2\nitem 10');
});

test('تغيير حالة الأحرف', () => {
  assert.equal(changeCase('hello WORLD', 'upper'), 'HELLO WORLD');
  assert.equal(changeCase('hello WORLD', 'lower'), 'hello world');
  assert.equal(changeCase('hello world', 'title'), 'Hello World');
  assert.equal(changeCase('مرحبا بك', 'title'), 'مرحبا بك');
});

test('خريطة التنظيف تحتوي كل العمليات', () => {
  assert.deepEqual(Object.keys(CLEANUPS).sort(), ['dupes', 'empty', 'lower', 'merge', 'sort', 'spaces', 'title', 'upper']);
  assert.equal(CLEANUPS.spaces('a   b'), 'a b');
});
