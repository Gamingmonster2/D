/*
 * text-tools.js — أدوات نص نقية قابلة للاختبار:
 * عدّ الكلمات (Intl.Segmenter)، دمج الأسطر المقطوعة، تنظيف المسافات والأسطر، تغيير حالة الأحرف.
 */

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/u;

/** عدد الكلمات باستخدام مقسّم كلمات المتصفح (يدعم اليابانية/الصينية بلا مسافات). */
export function countWords(text, locale = 'ar') {
  const value = String(text ?? '');
  if (!value.trim()) return 0;
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    let count = 0;
    for (const segment of segmenter.segment(value)) {
      if (segment.isWordLike) count += 1;
    }
    return count;
  } catch {
    const matches = value.match(/[\p{L}\p{N}_]+/gu);
    return matches ? matches.length : 0;
  }
}

function mergeParagraph(paragraph) {
  const lines = paragraph.split('\n').map((line) => line.trim());
  let merged = '';
  for (const line of lines) {
    if (!line) continue;
    if (!merged) {
      merged = line;
      continue;
    }
    const glue = CJK.test(merged[merged.length - 1]) && CJK.test(line[0]) ? '' : ' ';
    merged += glue + line;
  }
  return merged;
}

/** دمج الأسطر المقطوعة داخل الفقرات مع إبقاء الفصل بين الفقرات (سطر فارغ). */
export function mergeBrokenLines(text) {
  return String(text).split(/\n{2,}/).map(mergeParagraph).join('\n\n');
}

/** إزالة المسافات الزائدة داخل الأسطر وفي نهايتها. */
export function removeExtraSpaces(text) {
  return String(text).split('\n').map((line) => line.replace(/[ \t]+/g, ' ').replace(/[ \t]+$/, '')).join('\n');
}

/** إزالة الأسطر الفارغة. */
export function removeEmptyLines(text) {
  return String(text).split('\n').filter((line) => line.trim() !== '').join('\n');
}

/** إزالة الأسطر المكررة (تمييز حالة الأحرف، مع إبقاء الأسطر الفارغة). */
export function removeDuplicateLines(text) {
  const seen = new Set();
  return String(text).split('\n').filter((line) => {
    if (line === '') return true;
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  }).join('\n');
}

/** ترتيب الأسطر ترتيباً طبيعياً (Apple قبل item 2 قبل item 10) مع ترك الأسطر الفارغة في النهاية. */
export function sortLines(text, locale = 'ar') {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'variant' });
  const lines = String(text).split('\n');
  const content = lines.filter((line) => line.trim() !== '');
  const blanks = lines.filter((line) => line.trim() === '');
  content.sort(collator.compare);
  return [...content, ...blanks].join('\n');
}

/** تغيير حالة الأحرف: upper / lower / title. */
export function changeCase(text, mode, locale = 'ar') {
  const value = String(text);
  if (mode === 'upper') return value.toLocaleUpperCase(locale);
  if (mode === 'lower') return value.toLocaleLowerCase(locale);
  if (mode === 'title') {
    return value.replace(/(^|[\s،؛.,!?])(\p{L})/gu, (match, prefix, letter) => prefix + letter.toLocaleUpperCase(locale));
  }
  return value;
}

/** خريطة عمليات التنظيف المناسبة لواجهة التطبيق. */
export const CLEANUPS = {
  merge: mergeBrokenLines,
  spaces: removeExtraSpaces,
  empty: removeEmptyLines,
  dupes: removeDuplicateLines,
  sort: sortLines,
  upper: (text) => changeCase(text, 'upper'),
  lower: (text) => changeCase(text, 'lower'),
  title: (text) => changeCase(text, 'title'),
};
