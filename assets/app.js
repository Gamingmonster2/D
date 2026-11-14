/*
 * app.js — المفكرة (نسخة الويب).
 * مستوحاة من تحليل Notepad.exe عبر REA + Ghidra:
 * فتح/حفظ بترميزات UTF-8/UTF-16/ANSI، كشف تلقائي، نهايات أسطر، .LOG،
 * بحث/استبدال، إعدادات، وحفظ تلقائي محلي.
 */
import {
  ENCODINGS,
  EOLS,
  encodingLabel,
  detectEncoding,
  decodeBytes,
  encodeString,
  detectEOL,
  toLF,
  applyEOL,
  countLines,
} from './codec.js';

const SETTINGS_KEY = 'd-notepad:settings';
const DEFAULT_SETTINGS = {
  encoding: 'utf-8',
  eol: 'crlf',
  wrap: true,
  theme: 'auto',
  fontFamily: 'Segoe UI',
  fontSize: 16,
  editorDir: 'auto',
};

const els = {
  editor: document.getElementById('editor'),
  docTitle: document.getElementById('docTitle'),
  dirtyBadge: document.getElementById('dirtyBadge'),
  docName: document.getElementById('docName'),
  posInfo: document.getElementById('posInfo'),
  selInfo: document.getElementById('selInfo'),
  counts: document.getElementById('counts'),
  saveState: document.getElementById('saveState'),
  encodingSel: document.getElementById('encodingSel'),
  eolSel: document.getElementById('eolSel'),
  wrapBtn: document.getElementById('wrapBtn'),
  dirBtn: document.getElementById('dirBtn'),
  themeBtn: document.getElementById('themeBtn'),
  findBar: document.getElementById('findBar'),
  findInput: document.getElementById('findInput'),
  replaceInput: document.getElementById('replaceInput'),
  findCount: document.getElementById('findCount'),
  matchCase: document.getElementById('matchCase'),
  useRegex: document.getElementById('useRegex'),
  wrapSearch: document.getElementById('wrapSearch'),
  restoreBanner: document.getElementById('restoreBanner'),
  restoreInfo: document.getElementById('restoreInfo'),
  fileInput: document.getElementById('fileInput'),
  fontDialog: document.getElementById('fontDialog'),
  fontFamilySel: document.getElementById('fontFamilySel'),
  fontSizeInput: document.getElementById('fontSizeInput'),
  fontApply: document.getElementById('fontApply'),
  fontCancel: document.getElementById('fontCancel'),
  gotoDialog: document.getElementById('gotoDialog'),
  gotoInput: document.getElementById('gotoInput'),
  gotoApply: document.getElementById('gotoApply'),
  gotoCancel: document.getElementById('gotoCancel'),
  aboutDialog: document.getElementById('aboutDialog'),
};

const state = {
  handle: null,
  name: 'بدون عنوان',
  dirty: false,
  encoding: 'utf-8',
  eol: 'crlf',
  editorDir: 'auto',
  restoreDraft: null,
};

let settings = loadSettings();
let autosaveTimer = null;
let dbPromise = null;

/* ------------------------------ التخزين ------------------------------ */

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* التخزين غير متاح */
  }
}

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('d-notepad', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function kvGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const request = tx.objectStore('kv').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function kvDel(key) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* تجاهل */
  }
}

/* ------------------------------ واجهة عامة ------------------------------ */

function setSaveState(text) {
  els.saveState.textContent = text;
}

function updateTitle() {
  const title = state.name || 'بدون عنوان';
  els.docTitle.textContent = title;
  els.docName.textContent = title;
  document.title = (state.dirty ? '• ' : '') + title + ' — المفكرة';
}

function markDirty() {
  if (!state.dirty) {
    state.dirty = true;
    els.dirtyBadge.hidden = false;
    updateTitle();
  }
  scheduleAutosave();
}

function clearDirty() {
  state.dirty = false;
  els.dirtyBadge.hidden = true;
  updateTitle();
}

function updateStatusBar() {
  const value = els.editor.value;
  const start = els.editor.selectionStart;
  const end = els.editor.selectionEnd;
  const before = value.slice(0, start);
  const line = before.split('\n').length;
  const column = start - before.lastIndexOf('\n');
  els.posInfo.textContent = `سطر ${line}، عمود ${column}`;
  els.selInfo.textContent = start !== end ? `تحديد: ${end - start}` : '';
  const lines = countLines(value);
  els.counts.textContent = `${value.length} حرف · ${lines} سطر`;
  if (start !== end) els.counts.textContent += ` · تحديد ${end - start}`;
}

/* ------------------------------ الحفظ التلقائي ------------------------------ */

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(flushAutosave, 1000);
}

async function flushAutosave() {
  if (!state.dirty) return;
  try {
    await kvSet('autosave', {
      text: els.editor.value,
      name: state.name,
      encoding: state.encoding,
      eol: state.eol,
      editorDir: state.editorDir,
      ts: Date.now(),
    });
    setSaveState(`حفظ تلقائي ${new Date().toLocaleTimeString('ar')}`);
  } catch {
    setSaveState('تعذّر الحفظ التلقائي');
  }
}

async function clearAutosave() {
  clearTimeout(autosaveTimer);
  await kvDel('autosave');
}

async function initRestore() {
  const draft = await kvGet('autosave');
  if (draft && typeof draft.text === 'string' && draft.text.length > 0) {
    state.restoreDraft = draft;
    const when = draft.ts ? new Date(draft.ts).toLocaleString('ar') : 'سابقاً';
    els.restoreInfo.textContent = `يوجد مستند غير محفوظ «${draft.name || 'بدون عنوان'}» من ${when}.`;
    els.restoreBanner.hidden = false;
  }
}

async function restoreDraft() {
  const draft = state.restoreDraft;
  if (!draft) return;
  els.editor.value = draft.text;
  state.name = draft.name || 'بدون عنوان';
  state.encoding = ENCODINGS.some((e) => e.id === draft.encoding) ? draft.encoding : settings.encoding;
  state.eol = EOLS.some((e) => e.id === draft.eol) ? draft.eol : settings.eol;
  state.editorDir = draft.editorDir || 'auto';
  applyEditorDir();
  syncSelects();
  els.restoreBanner.hidden = true;
  state.restoreDraft = null;
  state.dirty = true;
  els.dirtyBadge.hidden = false;
  updateTitle();
  updateStatusBar();
  setSaveState('جاهز — مستند مستعاد');
  els.editor.focus();
}

async function discardDraft() {
  state.restoreDraft = null;
  els.restoreBanner.hidden = true;
  await clearAutosave();
  setSaveState('جاهز');
}

/* ------------------------------ الملفات ------------------------------ */

async function confirmDiscard() {
  if (!state.dirty) return true;
  return window.confirm('يوجد تعديلات غير محفوظة. هل تريد المتابعة بدون حفظ؟');
}

function bytesForSave() {
  const text = applyEOL(els.editor.value, state.eol);
  return encodeString(text, state.encoding);
}

function applyLoadedText(rawText, name, handle) {
  const detected = detectEncoding(rawText);
  const raw = decodeBytes(rawText, detected.encoding);
  const eol = detectEOL(raw);
  const text = toLF(raw);
  state.handle = handle || null;
  state.name = name || 'مستند.txt';
  state.encoding = detected.encoding;
  state.eol = eol;
  els.editor.value = text;
  syncSelects();
  clearDirty();
  applyLogFeature();
  updateStatusBar();
  setSaveState(`تم الفتح — ${encodingLabel(state.encoding)}`);
}

function applyLogFeature() {
  const firstLine = els.editor.value.split('\n')[0].trim();
  if (firstLine.toUpperCase() !== '.LOG') return;
  const stamp = new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  const value = els.editor.value;
  const sep = value.endsWith('\n') || value.length === 0 ? '' : '\n';
  els.editor.value = value + sep + stamp + '\n';
  els.editor.setSelectionRange(els.editor.value.length, els.editor.value.length);
  markDirty();
}

async function loadBuffer(buffer, name, handle) {
  applyLoadedText(buffer, name, handle);
  await clearAutosave();
  els.editor.focus();
}

async function openDocument() {
  if (!(await confirmDiscard())) return;
  if (typeof window.showOpenFilePicker === 'function') {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'ملفات نصية',
            accept: {
              'text/plain': ['.txt', '.log', '.md', '.json', '.xml', '.csv', '.html', '.htm', '.css', '.js', '.ini', '.yml', '.yaml'],
            },
          },
        ],
      });
      const file = await handle.getFile();
      const buffer = new Uint8Array(await file.arrayBuffer());
      await loadBuffer(buffer, file.name, handle);
      return;
    } catch (cause) {
      if (cause && cause.name === 'AbortError') return;
      /* متابعة إلى البديل */
    }
  }
  els.fileInput.value = '';
  els.fileInput.click();
}

async function openFromInput() {
  const file = els.fileInput.files && els.fileInput.files[0];
  if (!file) return;
  const buffer = new Uint8Array(await file.arrayBuffer());
  await loadBuffer(buffer, file.name, null);
}

async function saveDocument() {
  if (state.handle && typeof state.handle.createWritable === 'function') {
    try {
      const writable = await state.handle.createWritable();
      await writable.write(bytesForSave());
      await writable.close();
      await afterSave(state.handle.name || state.name);
      return;
    } catch (cause) {
      if (cause && cause.name === 'AbortError') return;
      setSaveState('تعذّر الحفظ');
      window.alert(`تعذّر الحفظ: ${cause && cause.message ? cause.message : cause}`);
      return;
    }
  }
  await saveDocumentAs();
}

async function saveDocumentAs() {
  const suggested = state.name && state.name !== 'بدون عنوان' ? state.name : 'مستند.txt';
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [{ description: 'ملف نصي', accept: { 'text/plain': ['.txt', '.log', '.md'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytesForSave());
      await writable.close();
      await afterSave(handle.name || suggested, handle);
      return;
    } catch (cause) {
      if (cause && cause.name === 'AbortError') return;
      /* متابعة إلى التنزيل */
    }
  }
  downloadFallback();
}

function downloadFallback() {
  const blob = new Blob([bytesForSave()], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.name && state.name !== 'بدون عنوان' ? state.name : 'مستند.txt';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  afterSave(anchor.download);
}

async function afterSave(name, handle) {
  if (handle) state.handle = handle;
  if (name) state.name = name;
  clearDirty();
  updateStatusBar();
  await clearAutosave();
  setSaveState('تم الحفظ');
}

async function newDocument() {
  if (!(await confirmDiscard())) return;
  els.editor.value = '';
  state.handle = null;
  state.name = 'بدون عنوان';
  state.encoding = settings.encoding;
  state.eol = settings.eol;
  syncSelects();
  clearDirty();
  updateStatusBar();
  await clearAutosave();
  setSaveState('جاهز');
  els.editor.focus();
}

/* ------------------------------ الترميز ونهاية السطر ------------------------------ */

function syncSelects() {
  els.encodingSel.value = state.encoding;
  els.eolSel.value = state.eol;
}

function populateSelects() {
  els.encodingSel.innerHTML = '';
  for (const item of ENCODINGS) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    els.encodingSel.appendChild(option);
  }
  els.eolSel.innerHTML = '';
  for (const item of EOLS) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    els.eolSel.appendChild(option);
  }
}

function onEncodingChange() {
  state.encoding = els.encodingSel.value;
  settings.encoding = state.encoding;
  saveSettings();
  markDirty();
  setSaveState(`سيُحفظ بـ ${encodingLabel(state.encoding)}`);
}

function onEolChange() {
  state.eol = els.eolSel.value;
  settings.eol = state.eol;
  saveSettings();
  markDirty();
  setSaveState(`سيُحفظ بنهاية سطر ${state.eol.toUpperCase()}`);
}

/* ------------------------------ البحث والاستبدال ------------------------------ */

function openFind(withReplace) {
  els.findBar.hidden = false;
  els.findInput.focus();
  els.findInput.select();
  if (withReplace) {
    els.replaceInput.focus();
  }
  refreshFindCount();
}

function closeFind() {
  els.findBar.hidden = true;
  els.editor.focus();
}

function buildFindSpec() {
  const query = els.findInput.value;
  els.findInput.classList.remove('invalid');
  if (!query) return null;
  const matchCase = els.matchCase.checked;
  const regex = els.useRegex.checked;
  let compiled = null;
  if (regex) {
    try {
      compiled = new RegExp(query, matchCase ? 'g' : 'gi');
    } catch {
      els.findInput.classList.add('invalid');
      els.findCount.textContent = 'نمط غير صالح';
      return null;
    }
  }
  return { query, matchCase, regex, compiled };
}

function collectMatches(spec, value) {
  const matches = [];
  if (!spec) return matches;
  if (spec.regex) {
    const re = new RegExp(spec.compiled.source, spec.compiled.flags.includes('i') ? 'gi' : 'g');
    let match;
    while ((match = re.exec(value)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) re.lastIndex += 1;
      if (matches.length >= 20000) break;
    }
    return matches;
  }
  let index = 0;
  while (index <= value.length) {
    const found = value.indexOf(spec.query, index);
    if (found === -1) break;
    matches.push({ start: found, end: found + spec.query.length });
    index = found + (spec.query.length || 1);
    if (matches.length >= 20000) break;
  }
  return matches;
}

function refreshFindCount() {
  const spec = buildFindSpec();
  const matches = collectMatches(spec, els.editor.value);
  els.findCount.textContent = spec ? (matches.length ? `${matches.length} نتيجة` : 'لا نتائج') : '';
}

function findNext(direction) {
  const spec = buildFindSpec();
  if (!spec) return;
  const value = els.editor.value;
  const matches = collectMatches(spec, value);
  if (!matches.length) {
    els.findCount.textContent = 'لا نتائج';
    return;
  }
  const wrap = els.wrapSearch.checked;
  const position = direction >= 0 ? els.editor.selectionEnd : els.editor.selectionStart;
  let target = null;
  if (direction >= 0) {
    target = matches.find((m) => m.start >= position) || (wrap ? matches[0] : null);
  } else {
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      if (matches[i].end <= position) {
        target = matches[i];
        break;
      }
    }
    if (!target && wrap) target = matches[matches.length - 1];
  }
  if (!target) {
    els.findCount.textContent = direction >= 0 ? 'نهاية المستند' : 'بداية المستند';
    return;
  }
  els.editor.focus();
  els.editor.setSelectionRange(target.start, target.end);
  updateStatusBar();
  const index = matches.findIndex((m) => m.start === target.start);
  els.findCount.textContent = `${index + 1} من ${matches.length}`;
}

function replaceCurrent() {
  const spec = buildFindSpec();
  if (!spec) return;
  const start = els.editor.selectionStart;
  const end = els.editor.selectionEnd;
  const selected = els.editor.value.slice(start, end);
  const replacement = els.replaceInput.value;
  let matched = false;
  if (spec.regex) {
    try {
      matched = new RegExp(`^(?:${spec.compiled.source})$`, spec.compiled.flags.includes('i') ? 'i' : '').test(selected);
    } catch {
      matched = false;
    }
  } else {
    matched = selected === spec.query;
  }
  if (!matched) {
    findNext(1);
    return;
  }
  let replaced;
  if (spec.regex) {
    replaced = selected.replace(new RegExp(spec.compiled.source, spec.compiled.flags.includes('i') ? 'i' : ''), replacement);
  } else {
    replaced = replacement;
  }
  els.editor.setRangeText(replaced, start, end, 'end');
  markDirty();
  updateStatusBar();
  findNext(1);
}

function replaceAll() {
  const spec = buildFindSpec();
  if (!spec) return;
  const value = els.editor.value;
  let next = value;
  if (spec.regex) {
    const re = new RegExp(spec.compiled.source, spec.compiled.flags.includes('i') ? 'gi' : 'g');
    if (re.test('')) {
      els.findCount.textContent = 'نمط فارغ غير مدعوم';
      return;
    }
    next = value.replace(re, els.replaceInput.value);
  } else {
    next = value.split(spec.query).join(els.replaceInput.value);
  }
  if (next === value) {
    els.findCount.textContent = 'لا نتائج';
    return;
  }
  const position = els.editor.selectionStart;
  els.editor.value = next;
  els.editor.setSelectionRange(Math.min(position, next.length), Math.min(position, next.length));
  markDirty();
  updateStatusBar();
  refreshFindCount();
}

/* ------------------------------ إدراج التاريخ والانتقال ------------------------------ */

function insertDateTime() {
  const stamp = new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
  insertText(stamp);
}

function insertText(text) {
  const start = els.editor.selectionStart;
  const end = els.editor.selectionEnd;
  els.editor.setRangeText(text, start, end, 'end');
  markDirty();
  updateStatusBar();
  els.editor.focus();
}

function openGoto() {
  const value = els.editor.value;
  const before = value.slice(0, els.editor.selectionStart);
  els.gotoInput.value = before.split('\n').length;
  els.gotoDialog.showModal();
  els.gotoInput.focus();
  els.gotoInput.select();
}

function applyGoto() {
  const requested = Math.max(1, Number(els.gotoInput.value) || 1);
  const value = els.editor.value;
  const lines = value.split('\n');
  const index = Math.min(requested, lines.length) - 1;
  let offset = 0;
  for (let i = 0; i < index; i += 1) offset += lines[i].length + 1;
  els.editor.focus();
  els.editor.setSelectionRange(offset, offset);
  updateStatusBar();
  els.gotoDialog.close();
}

/* ------------------------------ العرض ------------------------------ */

function applySettingsToUi() {
  els.editor.style.fontFamily = `"${settings.fontFamily}", "Segoe UI", Tahoma, sans-serif`;
  els.editor.style.fontSize = `${settings.fontSize}px`;
  els.fontFamilySel.value = settings.fontFamily;
  els.fontSizeInput.value = String(settings.fontSize);
  els.editor.classList.toggle('wrap', settings.wrap);
  els.wrapBtn.setAttribute('aria-pressed', String(settings.wrap));
  state.editorDir = settings.editorDir;
  applyEditorDir();
  applyTheme(settings.theme);
}

function applyTheme(theme) {
  settings.theme = theme;
  let effective = theme;
  if (theme === 'auto') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = effective;
  els.themeBtn.textContent = effective === 'dark' ? 'مضيء' : 'داكن';
  saveSettings();
}

function applyEditorDir() {
  const dir = state.editorDir;
  els.editor.dir = dir === 'rtl' ? 'rtl' : dir === 'ltr' ? 'ltr' : 'auto';
  els.dirBtn.textContent = dir === 'rtl' ? 'الاتجاه: RTL' : dir === 'ltr' ? 'الاتجاه: LTR' : 'الاتجاه: تلقائي';
}

function toggleTheme() {
  const effective = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(effective);
}

function toggleDir() {
  const order = ['auto', 'rtl', 'ltr'];
  state.editorDir = order[(order.indexOf(state.editorDir) + 1) % order.length];
  settings.editorDir = state.editorDir;
  applyEditorDir();
  saveSettings();
}

function toggleWrap() {
  settings.wrap = !settings.wrap;
  els.editor.classList.toggle('wrap', settings.wrap);
  els.wrapBtn.setAttribute('aria-pressed', String(settings.wrap));
  saveSettings();
}

function openFontDialog() {
  els.fontFamilySel.value = settings.fontFamily;
  els.fontSizeInput.value = String(settings.fontSize);
  els.fontDialog.showModal();
}

function applyFont() {
  const family = els.fontFamilySel.value;
  const size = Math.min(72, Math.max(8, Number(els.fontSizeInput.value) || 16));
  settings.fontFamily = family;
  settings.fontSize = size;
  els.editor.style.fontFamily = `"${family}", "Segoe UI", Tahoma, sans-serif`;
  els.editor.style.fontSize = `${size}px`;
  saveSettings();
  els.fontDialog.close();
  els.editor.focus();
}

function changeFontSize(direction) {
  if (direction === 0) {
    settings.fontSize = DEFAULT_SETTINGS.fontSize;
  } else {
    settings.fontSize = Math.min(72, Math.max(8, settings.fontSize + direction));
  }
  els.editor.style.fontSize = `${settings.fontSize}px`;
  saveSettings();
}

function printDocument() {
  const pre = document.createElement('pre');
  pre.className = 'print-content';
  pre.dir = 'auto';
  pre.textContent = els.editor.value;
  document.body.appendChild(pre);
  window.print();
  setTimeout(() => pre.remove(), 800);
}

/* ------------------------------ الأحداث ------------------------------ */

function onEditorInput() {
  markDirty();
  updateStatusBar();
  if (!els.findBar.hidden) refreshFindCount();
}

function onSelectionChange() {
  updateStatusBar();
}

function handleAction(action) {
  switch (action) {
    case 'new': newDocument(); break;
    case 'open': openDocument(); break;
    case 'save': saveDocument(); break;
    case 'saveAs': saveDocumentAs(); break;
    case 'undo': els.editor.focus(); document.execCommand('undo'); break;
    case 'redo': els.editor.focus(); document.execCommand('redo'); break;
    case 'find': openFind(false); break;
    case 'replace': openFind(true); break;
    case 'goto': openGoto(); break;
    case 'font': openFontDialog(); break;
    case 'wrap': toggleWrap(); break;
    case 'dir': toggleDir(); break;
    case 'theme': toggleTheme(); break;
    case 'print': printDocument(); break;
    case 'about': els.aboutDialog.showModal(); break;
    default: break;
  }
}

function bindEvents() {
  document.querySelector('.toolbar').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    handleAction(button.dataset.action);
  });

  els.findBar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-find]');
    if (!button) return;
    switch (button.dataset.find) {
      case 'next': findNext(1); break;
      case 'prev': findNext(-1); break;
      case 'replace': replaceCurrent(); break;
      case 'replaceAll': replaceAll(); break;
      case 'close': closeFind(); break;
      default: break;
    }
  });

  els.editor.addEventListener('input', onEditorInput);
  els.editor.addEventListener('click', onSelectionChange);
  els.editor.addEventListener('keyup', onSelectionChange);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === els.editor) onSelectionChange();
  });

  els.encodingSel.addEventListener('change', onEncodingChange);
  els.eolSel.addEventListener('change', onEolChange);
  els.findInput.addEventListener('input', refreshFindCount);
  els.findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findNext(event.shiftKey ? -1 : 1);
    }
  });
  els.wrapSearch.addEventListener('change', refreshFindCount);

  els.restoreBanner.addEventListener('click', (event) => {
    if (event.target.id === 'restoreBtn') restoreDraft();
    if (event.target.id === 'discardBtn') discardDraft();
  });

  els.fileInput.addEventListener('change', openFromInput);

  els.fontApply.addEventListener('click', (event) => {
    event.preventDefault();
    applyFont();
  });
  els.fontCancel.addEventListener('click', () => els.fontDialog.close());
  els.gotoApply.addEventListener('click', (event) => {
    event.preventDefault();
    applyGoto();
  });
  els.gotoCancel.addEventListener('click', () => els.gotoDialog.close());
  els.gotoInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyGoto();
    }
  });

  document.addEventListener('keydown', (event) => {
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (event.shiftKey) saveDocumentAs();
        else saveDocument();
        return;
      }
      if (key === 'o') { event.preventDefault(); openDocument(); return; }
      if (key === 'n') { event.preventDefault(); newDocument(); return; }
      if (key === 'f') { event.preventDefault(); openFind(false); return; }
      if (key === 'h') { event.preventDefault(); openFind(true); return; }
      if (key === 'g') { event.preventDefault(); openGoto(); return; }
      if (key === 'p') { event.preventDefault(); printDocument(); return; }
      if (key === '=' || key === '+') { event.preventDefault(); changeFontSize(1); return; }
      if (key === '-') { event.preventDefault(); changeFontSize(-1); return; }
      if (key === '0') { event.preventDefault(); changeFontSize(0); return; }
    }
    if (event.key === 'F3') {
      event.preventDefault();
      if (els.findBar.hidden) openFind(false);
      else findNext(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'F5') {
      event.preventDefault();
      insertDateTime();
      return;
    }
    if (event.key === 'Escape' && !els.findBar.hidden) {
      event.preventDefault();
      closeFind();
    }
  });

  ['dragenter', 'dragover'].forEach((name) => {
    document.addEventListener(name, (event) => event.preventDefault());
  });
  document.addEventListener('drop', async (event) => {
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    if (!(await confirmDiscard())) return;
    const buffer = new Uint8Array(await file.arrayBuffer());
    await loadBuffer(buffer, file.name, null);
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.dirty) flushAutosave();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') applyTheme('auto');
  });
}

/* ------------------------------ التهيئة ------------------------------ */

function init() {
  populateSelects();
  state.encoding = ENCODINGS.some((e) => e.id === settings.encoding) ? settings.encoding : DEFAULT_SETTINGS.encoding;
  state.eol = EOLS.some((e) => e.id === settings.eol) ? settings.eol : DEFAULT_SETTINGS.eol;
  syncSelects();
  applySettingsToUi();
  bindEvents();
  updateTitle();
  updateStatusBar();
  setSaveState('جاهز');
  els.editor.focus();
  initRestore();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
