import { isConfigured } from './firebase-config.js';
import * as L from './logic.js';

const $ = id => document.getElementById(id);
const SCREENS = ['loading', 'setup', 'signin', 'app'];
const show = name => SCREENS.forEach(s => { $('screen-' + s).hidden = s !== name; });
const narrow = matchMedia('(max-width: 759px)');
const CHECK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="var(--accent-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LAST = 'actinerary.lastList';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

// actinerary.app is the main address. Browser tabs on the old Firebase addresses go there.
// Apps installed from an old address keep working there and show a note about the new one.
const OLD_HOSTS = ['actionary-b6dff.web.app', 'actionary-b6dff.firebaseapp.com'];
const installedApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (OLD_HOSTS.includes(location.hostname) && !installedApp) {
  location.replace('https://actinerary.app' + location.pathname + location.search + location.hash);
}
if (OLD_HOSTS.includes(location.hostname) && installedApp) {
  addEventListener('DOMContentLoaded', () => {
    const n = document.getElementById('movedNote');
    if (n) n.hidden = false;
  });
}

let store = null;
let user = null;
let stopLists = null;
let loaded = false;
const lists = new Map();      // id -> list
const flagsBy = {};           // list id -> { item id -> flag }
const timers = new Map();     // list id -> pending save timer
let currentId = null;
let banner = null;
let pendingFocus = null;
let lastFocusId = null;

const cur = () => lists.get(currentId) || null;
const F = () => (flagsBy[currentId] ||= {});
const sig = l => JSON.stringify([l.title || '', l.items, l.completedAt || null]);
const viewOnly = () => !!(cur() && cur().completedAt); // completed lists can't be edited until reopened
const isTpl = () => !!(cur() && cur().isTemplate);
const store_get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const store_set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

/* ---------- start-up ---------- */
init();
async function init() {
  if (!isConfigured) return show('setup');
  try {
    store = await import('./store.js');
  } catch (e) {
    show('signin');
    return signInError('Couldn’t load sign-in. Check your internet connection and reload.');
  }
  const e = await store.redirectError();
  if (e) signInError(describeAuthError(e));
  store.watchAuth(onUser);
}

function onUser(u) {
  if (stopLists) { stopLists(); stopLists = null; }
  user = u; loaded = false; lists.clear();
  if (!u) { show('signin'); return; }
  $('userEmail').textContent = u.email || '';
  show('app');
  renderSidebar(); renderEditor();
  const loadError = err => {
    banner = { type: 'error', title: 'Couldn’t load your lists.', msgs: [err.code === 'permission-denied'
      ? 'Permission denied. Make sure the Firestore rules are deployed (see the README).'
      : (err.message || String(err))] };
    renderBanner();
  };
  const a = store.watchLists(u.uid, onLists, loadError);
  const b = store.watchLists(u.uid, (t, r, c) => onLists(t, r, c, true), loadError, true);
  stopLists = () => { a(); b(); };
}

function normalize(l) {
  l.items = Array.isArray(l.items) ? l.items : [];
  l.items.forEach(it => {
    it.children = Array.isArray(it.children) ? it.children : [];
    it.autoPaused = !!it.autoPaused; it.done = !!it.done; L.fromSaved(it);
    it.children.forEach(c => { c.done = !!c.done; L.fromSaved(c); });
  });
  return l;
}

function onLists(incoming, removed, fromCache, templates = false) {
  let currentChanged = false;
  for (const l of incoming) {
    if (timers.has(l.id)) continue; // local edits not yet saved win
    const local = lists.get(l.id);
    normalize(l);
    if (!local || sig(local) !== sig(l)) {
      lists.set(l.id, l);
      if (l.id === currentId) currentChanged = true;
    } else {
      local.updatedAt = l.updatedAt; local.sortedAt = l.sortedAt;
    }
  }
  for (const id of removed) {
    if (timers.has(id)) continue;
    lists.delete(id);
    if (id === currentId) { currentId = null; currentChanged = true; }
  }
  if (!templates && !loaded && (incoming.length || !fromCache)) {
    loaded = true;
    setView(narrow.matches ? 'index' : 'list');
    currentChanged = true;
  }
  if (currentId && !lists.has(currentId)) { currentId = null; currentChanged = true; }
  if (!currentId && loaded && lists.size) {
    const last = store_get(LAST);
    currentId = lists.has(last) ? last : (sortedLists()[0] || sortedTemplates()[0]).id;
    currentChanged = true;
  }
  renderSidebar();
  if (currentChanged) renderEditor(true);
}

/* ---------- saving ---------- */
function touch(id = currentId) {
  if (!id) return;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => flush(id), 600));
}
function flush(id) {
  if (!timers.has(id)) return;
  clearTimeout(timers.get(id)); timers.delete(id);
  const l = lists.get(id);
  if (l && user) store.saveList(user.uid, l).catch(saveError);
  renderSidebar();
}
const flushAll = () => [...timers.keys()].forEach(flush);
function saveError(e) {
  banner = { type: 'error', title: 'Couldn’t save your changes.', msgs: [e.code === 'permission-denied'
    ? 'Permission denied. Make sure the Firestore rules are deployed (see the README).'
    : (e.message || String(e))] };
  renderBanner();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
addEventListener('pagehide', flushAll);

/* ---------- actions ---------- */
function apply(r) {
  if (!r) return;
  if (r.banner !== undefined) banner = r.banner;
  if (r.changed) touch();
  if (r.focus) pendingFocus = { id: r.focus, caret: r.caret };
  renderEditor(!r.focus);
}
const blocking = flags => Object.values(flags).some(f => f.kind !== 'none');

const clearConfirms = () => { $('confirmArea').innerHTML = ''; $('bottomConfirm').innerHTML = ''; };
function openList(id) {
  if (currentId && currentId !== id) flush(currentId);
  currentId = id; banner = null; clearConfirms();
  store_set(LAST, id);
  setView('list');
  renderSidebar(); renderEditor();
}
function askCarryOver() {
  const l = cur(); if (!l) return;
  const n = L.counts(l).open;
  const area = $('confirmArea'); area.innerHTML = '';
  const c = document.createElement('div'); c.className = 'confirm';
  const s = document.createElement('span');
  s.textContent = `Move ${n} open item${n === 1 ? '' : 's'} to a new list?`;
  const t = document.createElement('input');
  t.placeholder = 'New list title'; t.autocomplete = 'off'; t.spellcheck = true; t.setAttribute('autocorrect', 'on');
  const yes = button('Move', 'btn primary'); yes.disabled = true;
  const no = button('Cancel', 'btn');
  t.addEventListener('input', e => {
    capFirst(t, '', e);
    const taken = titleTaken(t.value, null);
    t.classList.toggle('taken', taken);
    yes.disabled = !t.value.trim() || taken;
    showTaken(taken);
  });
  t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && !yes.disabled) yes.click(); });
  yes.addEventListener('click', () => {
    const nl = L.carryOver(l, t.value.trim());
    delete flagsBy[l.id];
    touch(l.id); flush(l.id);
    lists.set(nl.id, nl);
    store.saveList(user.uid, nl).catch(saveError);
    area.innerHTML = ''; banner = null;
    currentId = nl.id; store_set(LAST, nl.id);
    renderSidebar(); renderEditor();
  });
  no.addEventListener('click', () => { area.innerHTML = ''; showTaken(false); });
  c.append(s, t, yes, no); area.appendChild(c);
  t.focus();
}
// Adds a list or template, saves it and opens it.
function addList(l, focusTitle) {
  if (currentId) flush(currentId);
  lists.set(l.id, l);
  store.saveList(user.uid, l).catch(saveError);
  currentId = l.id; banner = null; store_set(LAST, l.id); clearConfirms();
  setView('list');
  renderSidebar(); renderEditor();
  if (focusTitle) $('title').focus();
}
// A new list from a template copies its items, unchecked, and is titled with the template name plus a date.
function fromTemplate(t, title) {
  const l = L.makeList(title);
  if (t.items.length) l.items = L.copyItems(t.items);
  l.sortedAt = t.sortedAt;
  return l;
}
function newList() {
  const tpls = sortedTemplates();
  if (!tpls.length) return addList(L.makeList(''), true);
  setView('list');
  const area = $('confirmArea'); area.innerHTML = '';
  const c = document.createElement('div'); c.className = 'confirm';
  const s = document.createElement('span'); s.textContent = 'New list from';
  const pick = document.createElement('select'); pick.setAttribute('aria-label', 'Template');
  pick.add(new Option('Blank list', ''));
  tpls.forEach(t => pick.add(new Option(t.title.trim() || 'Untitled', t.id)));
  const day = document.createElement('input'); day.type = 'date'; day.setAttribute('aria-label', 'Date');
  const now = new Date();
  day.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const made = document.createElement('span'); made.className = 'made';
  const yes = button('Create', 'btn primary');
  const no = button('Cancel', 'btn');
  const title = () => {
    const t = lists.get(pick.value); if (!t) return '';
    const [y, m, d] = (day.value || '').split('-').map(Number);
    return [t.title.trim(), y ? L.mmddyyyy(new Date(y, m - 1, d)) : ''].filter(Boolean).join(' ');
  };
  const check = () => {
    const tpl = !!pick.value;
    day.hidden = made.hidden = !tpl;
    made.textContent = title();
    const taken = tpl && titleTaken(title(), null);
    made.classList.toggle('taken', taken);
    yes.disabled = tpl && (!day.value || taken);
    showTaken(taken);
  };
  pick.addEventListener('change', check); day.addEventListener('input', check); day.addEventListener('change', check);
  day.addEventListener('keydown', e => { if (e.key === 'Enter' && !yes.disabled) yes.click(); });
  yes.addEventListener('click', () => {
    const t = lists.get(pick.value);
    showTaken(false);
    if (!t) return addList(L.makeList(''), true);
    addList(fromTemplate(t, title()));
  });
  no.addEventListener('click', () => { area.innerHTML = ''; showTaken(false); });
  c.append(s, pick, day, made, yes, no); area.appendChild(c);
  check(); pick.focus();
}
function newTemplate() {
  const t = L.makeList(''); t.isTemplate = true;
  addList(t, true);
}
function askSaveTemplate() {
  const l = cur(); if (!l) return;
  const area = $('confirmArea'); area.innerHTML = '';
  const c = document.createElement('div'); c.className = 'confirm';
  const s = document.createElement('span'); s.textContent = 'Save as template?';
  const t = document.createElement('input');
  t.placeholder = 'Template name'; t.autocomplete = 'off'; t.spellcheck = true; t.setAttribute('autocorrect', 'on');
  t.value = L.dropDate(l.title);
  const yes = button('Save', 'btn primary');
  const no = button('Cancel', 'btn');
  const check = () => {
    const taken = titleTaken(t.value, null, true);
    t.classList.toggle('taken', taken);
    yes.disabled = !t.value.trim() || taken;
    showTaken(taken);
  };
  t.addEventListener('input', e => { capFirst(t, '', e); check(); });
  t.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && !yes.disabled) yes.click(); });
  yes.addEventListener('click', () => {
    const nt = fromTemplate(l, t.value.trim()); nt.isTemplate = true;
    showTaken(false);
    addList(nt);
  });
  no.addEventListener('click', () => { area.innerHTML = ''; showTaken(false); });
  c.append(s, t, yes, no); area.appendChild(c);
  check(); t.focus();
}
function askDeleteList() {
  const l = cur(); if (!l) return;
  const area = $('bottomConfirm'); area.innerHTML = '';
  const c = document.createElement('div'); c.className = 'confirm';
  const s = document.createElement('span');
  s.textContent = `Delete “${L.short(l.title)}”? This can’t be undone.`;
  const yes = button('Delete', 'btn primary');
  const no = button('Cancel', 'btn');
  yes.addEventListener('click', () => {
    clearTimeout(timers.get(l.id)); timers.delete(l.id);
    lists.delete(l.id); delete flagsBy[l.id];
    store.removeList(user.uid, l).catch(saveError);
    area.innerHTML = ''; banner = null;
    currentId = sortedLists()[0]?.id || null;
    if (narrow.matches) setView('index');
    renderSidebar(); renderEditor();
  });
  no.addEventListener('click', () => { area.innerHTML = ''; });
  c.append(s, yes, no); area.appendChild(c);
  c.scrollIntoView({ block: 'nearest' });
}
function setView(v) { $('screen-app').dataset.view = v; }

/* ---------- rendering: sidebar ---------- */
// Open lists, most recently changed first, then completed lists, most recently completed first.
const onlyLists = () => [...lists.values()].filter(l => !l.isTemplate);
const sortedLists = () => [
  ...onlyLists().filter(l => !l.completedAt).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
  ...onlyLists().filter(l => l.completedAt).sort((a, b) => b.completedAt - a.completedAt),
];
// Templates, A to Z.
const sortedTemplates = () => [...lists.values()].filter(l => l.isTemplate)
  .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
const DONE_OPEN = 'actinerary.completedListsOpen';
const TPL_OPEN = 'actinerary.templatesOpen';
// Titles must be unique among lists, and separately among templates.
const titleTaken = (title, exceptId, templates = false) => {
  const k = L.titleKey(title);
  return !!k && [...lists.values()].some(l => l.id !== exceptId && !!l.isTemplate === templates && L.titleKey(l.title) === k);
};
let titleAtFocus = '';
const TAKEN = 'Title already used.';
function showTaken(on) {
  if (on) banner = { type: 'error', title: TAKEN, msgs: [] };
  else if (banner && banner.title === TAKEN) banner = null;
  renderBanner();
}
let query = ''; // the search box; while it has text the sidebar shows only matching lists
function renderSidebar() {
  const nav = $('lists'); nav.innerHTML = '';
  if (!loaded) {
    const p = document.createElement('div'); p.className = 'none';
    p.textContent = 'Loading your lists…';
    nav.appendChild(p); return;
  }
  const hits = new Map();
  if (query.trim()) for (const l of lists.values()) { const h = L.searchList(l, query); if (h) hits.set(l.id, h); }
  const searching = !!query.trim();
  const shown = ls => searching ? ls.filter(l => hits.has(l.id)) : ls;
  const all = sortedLists();
  const openLists = shown(all.filter(l => !l.completedAt)), doneLists = shown(all.filter(l => l.completedAt));
  const tpls = shown(sortedTemplates());
  const none = text => { const p = document.createElement('div'); p.className = 'none'; p.textContent = text; nav.appendChild(p); };
  if (searching && !hits.size) return none('No matches.');
  if (!searching && !all.length) none('No lists yet.');
  openLists.forEach(l => nav.append(...listLink(l, hits.get(l.id))));

  // Templates: collapsible, with + to make one from scratch. Search opens every section with matches.
  if (!searching || tpls.length) {
    const tOpen = searching || store_get(TPL_OPEN) === '1';
    const th = document.createElement('div'); th.className = 'tpl-head';
    const tt = button(`${tOpen ? '▾' : '▸'} Templates · ${tpls.length}`, 'done-lists-toggle');
    tt.setAttribute('aria-expanded', String(tOpen));
    tt.addEventListener('click', () => { store_set(TPL_OPEN, tOpen ? '0' : '1'); renderSidebar(); });
    const add = button('+', 'tpl-add'); add.setAttribute('aria-label', 'New template');
    add.addEventListener('click', newTemplate);
    th.append(tt, add);
    const tBox = document.createElement('div'); tBox.hidden = !tOpen;
    tpls.forEach(l => tBox.append(...listLink(l, hits.get(l.id))));
    nav.append(th, tBox);
  }

  if (doneLists.length) {
    const open = searching || store_get(DONE_OPEN) === '1';
    const h = button(`${open ? '▾' : '▸'} Completed Lists · ${doneLists.length}`, 'done-lists-toggle');
    h.setAttribute('aria-expanded', String(open));
    h.addEventListener('click', () => { store_set(DONE_OPEN, open ? '0' : '1'); renderSidebar(); });
    const doneBox = document.createElement('div'); doneBox.hidden = !open;
    doneLists.forEach(l => doneBox.append(...listLink(l, hits.get(l.id))));
    nav.append(h, doneBox);
  }
}
// Text with the search phrase highlighted.
function marked(el, text) {
  const k = query.trim().toLowerCase(), lower = text.toLowerCase();
  let at = 0, i;
  while (k && (i = lower.indexOf(k, at)) > -1) {
    el.append(text.slice(at, i));
    const m = document.createElement('mark'); m.textContent = text.slice(i, i + k.length); el.append(m);
    at = i + k.length;
  }
  el.append(text.slice(at));
}
// A list's link, plus its matching lines while searching.
function listLink(l, hit) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'list-link';
  b.setAttribute('aria-current', String(l.id === currentId));
  const t = document.createElement('span'); t.className = 't' + (l.title.trim() ? '' : ' untitled');
  marked(t, l.title.trim() || 'Untitled');
  const { open, done } = L.counts(l);
  const m = document.createElement('span'); m.className = 'm';
  m.textContent = l.isTemplate ? `${open} item${open === 1 ? '' : 's'}` : `${open} open · ${done} done`;
  b.append(t, m);
  b.addEventListener('click', () => openList(l.id));
  const lines = (hit ? hit.lines : []).map(x => {
    const h = button('', 'hit'); marked(h, x.text);
    h.addEventListener('click', () => { openList(l.id); flashItem(x.id); });
    return h;
  });
  return [b, ...lines];
}
// Scrolls to an item from a search result and briefly highlights it.
function flashItem(id) {
  const row = $('paper').querySelector(`.row[data-id="${id}"]`); if (!row) return;
  row.scrollIntoView({ block: 'center' });
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
}

/* ---------- drag and drop ---------- */
// The number box doubles as the drag handle: drag it with a mouse, or press and hold it on a touch screen.
// Dragging turns on for a list after its first Sort.
function wireDrag(rk, it, parent, row) {
  if (it.done) return;
  rk.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const p = { x: e.clientX, y: e.clientY, on: false, timer: null };
    let el = null, targets = [], to = 0;
    try { rk.setPointerCapture(e.pointerId); } catch (err) {}
    const mark = () => targets.forEach(t => t.classList.remove('drop-above', 'drop-below'));
    const over = y => {
      to = targets.filter(t => { const r = t.getBoundingClientRect(); return r.top + r.height / 2 < y; }).length;
      mark();
      if (to < targets.length) targets[to].classList.add('drop-above');
      else if (targets.length) targets[targets.length - 1].classList.add('drop-below');
      if (y < 60) scrollBy(0, -12); else if (y > innerHeight - 60) scrollBy(0, 12);
    };
    const begin = () => {
      const l = cur(); if (!l || viewOnly()) return stop();
      if (!l.sortedAt) { banner = { type: 'info', title: 'Tap Sort once to turn on dragging for this list.', msgs: [] }; renderBanner(); return stop(); }
      p.on = true; rk.blur();
      el = parent ? row : row.parentElement;
      targets = [...el.parentElement.children].filter(t => t !== el && !t.classList.contains('done'));
      el.classList.add('dragging'); document.body.classList.add('drag-on');
      if (navigator.vibrate) navigator.vibrate(10);
      over(p.y);
    };
    const moveH = e => {
      if (p.on) { e.preventDefault(); return over(e.clientY); }
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
      if (e.pointerType === 'mouse') { p.y = e.clientY; begin(); } else stop();
    };
    const upH = () => {
      const done = p.on; stop();
      if (done) apply(L.moveItem(cur(), it.id, to, F()));
    };
    function stop() {
      clearTimeout(p.timer); mark();
      if (el) el.classList.remove('dragging');
      document.body.classList.remove('drag-on');
      rk.removeEventListener('pointermove', moveH); rk.removeEventListener('pointerup', upH); rk.removeEventListener('pointercancel', stop);
    }
    rk.addEventListener('pointermove', moveH); rk.addEventListener('pointerup', upH); rk.addEventListener('pointercancel', stop);
    if (e.pointerType !== 'mouse') p.timer = setTimeout(begin, 350);
  });
}

/* ---------- rendering: editor ---------- */
// Capitalizes the first letter typed into an empty item or title. Only the very first character, never after a number.
function capFirst(el, before, e) {
  if (before !== '' || e.inputType !== 'insertText' || !/^\p{Ll}/u.test(el.value)) return;
  const p = el.selectionStart;
  el.value = el.value[0].toLocaleUpperCase() + el.value.slice(1);
  el.setSelectionRange(p, p);
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function button(text, cls) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; return b; }

function rowEl(it, parent, flags) {
  const row = document.createElement('div');
  const fl = flags[it.id];
  row.className = 'row' + (it.done ? ' done' : '') + (parent && parent.done ? ' locked' : '') + (fl ? ' flagged' : '');

  const cb = document.createElement('button');
  cb.className = 'check'; cb.type = 'button'; cb.innerHTML = CHECK;
  cb.setAttribute('aria-label', (it.done ? 'Uncheck ' : 'Check off ') + L.short(it.text));
  cb.disabled = viewOnly() || isTpl(); // template checkboxes are just for looks
  cb.addEventListener('click', () => {
    const flagsNow = F();
    const r = L.toggle(cur(), it.id, flagsNow);
    if (r.changed && banner && banner.type === 'error' && !blocking(flagsNow)) r.banner = null;
    apply(r);
  });

  const rk = document.createElement('input');
  rk.className = 'rank'; rk.inputMode = 'numeric'; rk.pattern = '[0-9]*'; rk.autocomplete = 'off'; rk.placeholder = ' ';
  rk.value = it.rank ?? ''; rk.disabled = it.done || viewOnly(); rk.dataset.rankId = it.id;
  rk.setAttribute('aria-label', 'Number for ' + L.short(it.text));
  rk.addEventListener('focus', () => { lastFocusId = it.id; });
  rk.addEventListener('input', () => {
    const v = rk.value.replace(/\D/g, ''); if (v !== rk.value) rk.value = v;
    const r = L.setRank(cur(), it.id, v);
    if (!r.ok) { if (r.banner) { banner = r.banner; renderBanner(); } return; }
    touch();
  });

  const ta = document.createElement('textarea');
  ta.rows = 1; ta.value = it.text; ta.dataset.itemId = it.id; ta.readOnly = viewOnly();
  ta.setAttribute('aria-label', parent ? 'Subtask' : 'Task');
  ta.addEventListener('focus', () => { lastFocusId = it.id; });
  ta.spellcheck = true; ta.setAttribute('autocorrect', 'on');
  ta.addEventListener('input', e => {
    const f0 = L.find(cur(), it.id);
    capFirst(ta, f0 ? f0.item.text : '', e);
    const r = L.setText(cur(), it.id, ta.value);
    if (!r.ok) {
      const f = L.find(cur(), it.id);
      const p = ta.selectionStart; ta.value = f ? f.item.text : ''; ta.setSelectionRange(Math.min(p, ta.value.length), Math.min(p, ta.value.length));
      if (r.banner) { banner = r.banner; renderBanner(); }
      return;
    }
    autosize(ta); touch(); syncCompleteBtn();
  });
  ta.addEventListener('keydown', e => {
    if (e.isComposing || ta.readOnly) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); apply(L.splitItem(cur(), it.id, ta.selectionStart, ta.selectionEnd)); }
    else if (e.key === 'Tab') { e.preventDefault(); apply(e.shiftKey ? L.outdent(cur(), it.id) : L.indent(cur(), it.id)); }
    else if (e.key === 'Backspace' && ta.value === '') { e.preventDefault(); apply(L.deleteEmpty(cur(), it.id, F())); }
    else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0) { e.preventDefault(); apply(L.joinPrev(cur(), it.id, F())); }
  });

  const flag = document.createElement('span'); flag.className = 'flag';
  if (fl) flag.textContent = { none: 'No number', open: 'Open' }[fl.kind];
  rk.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } });
  row.dataset.id = it.id;
  wireDrag(rk, it, parent, row);

  row.append(rk, cb, ta, flag);
  return row;
}

function syncCompleteBtn() {
  const l = cur(), b = $('completeBtn'), ro = viewOnly();
  ['completeBtn', 'carryBtn', 'saveTplBtn'].forEach(id => { $(id).hidden = isTpl(); });
  $('saveTplBtn').disabled = !l;
  b.textContent = ro ? 'Reopen list' : 'Complete List';
  b.disabled = !l || (!ro && !L.allChecked(l));
  $('carryBtn').disabled = !l || ro || !L.counts(l).open;
}
function renderEditor(keepFocus) {
  const l = cur();
  const titleEl = $('title');
  const has = !!l;
  $('emptyState').hidden = has || !loaded;
  $('paper').hidden = !has;
  ['sortBtn', 'sortBtn2', 'indentBtn', 'outdentBtn', 'deleteListBtn'].forEach(id => { $(id).disabled = !has || (id !== 'deleteListBtn' && viewOnly()); });
  $('bottomBar').hidden = !has;
  $('deleteListBtn').textContent = isTpl() ? 'Delete template' : 'Delete list';
  $('paper').classList.toggle('tpl', isTpl());
  syncCompleteBtn();
  $('title').readOnly = viewOnly(); $('addBtn').hidden = viewOnly();
  if (!has) { $('list').innerHTML = ''; $('doneList').innerHTML = ''; renderBanner(); return; }

  // Remember where the cursor was so a re-render (e.g. a change from another device) doesn't lose it.
  let saved = null;
  const a = document.activeElement;
  if (keepFocus && a && a.dataset && a.dataset.itemId) saved = { id: a.dataset.itemId, s: a.selectionStart, e: a.selectionEnd };
  else if (keepFocus && a && a.dataset && a.dataset.rankId) saved = { rank: a.dataset.rankId };

  if (document.activeElement !== titleEl) titleEl.value = l.title || '';
  const flags = F();
  // Open items go above + New item, completed items below it.
  const listEl = $('list'); listEl.innerHTML = '';
  const doneEl = $('doneList'); doneEl.innerHTML = '';
  const doneCount = l.items.filter(x => x.done).length;
  let labelShown = false;
  for (const it of l.items) {
    if (it.done && !labelShown) {
      const lab = document.createElement('div'); lab.className = 'section-label';
      lab.textContent = `Completed · ${doneCount}`; doneEl.appendChild(lab); labelShown = true;
    }
    const g = document.createElement('div'); g.className = 'group';
    g.appendChild(rowEl(it, null, flags));
    if (it.children.length) {
      const ch = document.createElement('div'); ch.className = 'children';
      it.children.forEach(c => ch.appendChild(rowEl(c, it, flags)));
      g.appendChild(ch);
    }
    (it.done ? doneEl : listEl).appendChild(g);
  }
  $('paper').querySelectorAll('.row textarea').forEach(autosize);
  renderBanner();

  const focusTa = id => $('paper').querySelector(`textarea[data-item-id="${id}"]`);
  if (pendingFocus) {
    const ta = focusTa(pendingFocus.id); const caret = pendingFocus.caret; pendingFocus = null;
    if (ta) { ta.focus(); const p = caret ?? ta.value.length; ta.setSelectionRange(p, p); }
  } else if (saved && saved.rank) {
    const rk = $('paper').querySelector(`input[data-rank-id="${saved.rank}"]`);
    if (rk) { rk.focus(); const p = rk.value.length; rk.setSelectionRange(p, p); }
  } else if (saved) {
    const ta = focusTa(saved.id);
    if (ta) { ta.focus(); try { ta.setSelectionRange(saved.s, saved.e); } catch (e) {} }
  }
}

function renderBanner() {
  const area = $('bannerArea'); area.innerHTML = '';
  if (!banner) return;
  const b = document.createElement('div');
  b.className = 'banner ' + banner.type;
  b.setAttribute('role', banner.type === 'error' ? 'alert' : 'status');
  const m = document.createElement('div'); m.className = 'msgs';
  const t = document.createElement('strong'); t.textContent = banner.title; m.appendChild(t);
  if (banner.msgs && banner.msgs.length) {
    const ul = document.createElement('ul');
    banner.msgs.forEach(s => { const li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
    m.appendChild(ul);
  }
  const x = button('×', ''); x.setAttribute('aria-label', 'Dismiss');
  x.addEventListener('click', () => {
    const kind = banner.clears; banner = null;
    if (!kind) return renderBanner();
    const flags = F();
    for (const id in flags) if (flags[id].kind === kind) delete flags[id];
    renderEditor(true);
  });
  b.append(m, x); area.appendChild(b);
}

/* ---------- sign-in ---------- */
function describeAuthError(e) {
  switch (e && e.code) {
    case 'auth/unauthorized-domain': return 'This web address isn’t on your Firebase project’s authorized domains list.';
    case 'auth/network-request-failed': return 'Couldn’t reach Google. Check your internet connection and try again.';
    case 'auth/operation-not-allowed': return 'Google sign-in isn’t turned on for this Firebase project yet.';
    default: return 'Sign-in didn’t finish. ' + ((e && (e.code || e.message)) || '');
  }
}
function signInError(msg) { const p = $('signInError'); p.textContent = msg; p.hidden = !msg; }

/* ---------- wiring ---------- */
$('signInBtn').addEventListener('click', () => {
  signInError('');
  if (!store) return signInError('Couldn’t load sign-in. Check your internet connection and reload.');
  store.signIn().catch(e => signInError(describeAuthError(e)));
});
$('signOutBtn').addEventListener('click', () => { flushAll(); store.signOutUser(); });
$('newListBtn').addEventListener('click', newList);
const setQuery = v => { query = v; if ($('search').value !== v) $('search').value = v; $('searchClear').hidden = !v; renderSidebar(); };
$('search').addEventListener('input', () => setQuery($('search').value));
$('search').addEventListener('keydown', e => { if (e.key === 'Escape') setQuery(''); });
$('searchClear').addEventListener('click', () => { setQuery(''); $('search').focus(); });
$('emptyNewBtn').addEventListener('click', newList);
$('deleteListBtn').addEventListener('click', askDeleteList);
$('carryBtn').addEventListener('click', askCarryOver);
$('backBtn').addEventListener('click', () => { if (currentId) flush(currentId); banner = null; clearConfirms(); setView('index'); renderSidebar(); });
const sortNow = () => {
  const l = cur(); if (!l) return;
  const r = L.sortList(l);
  flagsBy[l.id] = r.flags;
  if (!l.sortedAt) { l.sortedAt = Date.now(); r.changed = true; } // turns on dragging
  apply({ changed: r.changed, banner: r.banner });
};
$('sortBtn').addEventListener('click', sortNow);
$('sortBtn2').addEventListener('click', sortNow);
$('saveTplBtn').addEventListener('click', askSaveTemplate);
$('addBtn').addEventListener('click', () => { const l = cur(); if (l) apply(L.addAtEnd(l)); });
$('completeBtn').addEventListener('click', () => {
  const l = cur(); if (!l) return;
  if (l.completedAt) l.completedAt = null;
  else if (L.allChecked(l)) l.completedAt = Date.now();
  else return;
  banner = null; touch(l.id); flush(l.id);
  renderSidebar(); renderEditor();
});
$('title').addEventListener('focus', () => { titleAtFocus = cur()?.title || ''; });
// A title that's already used turns red and isn't saved. Leaving the box puts the previous title back.
$('title').addEventListener('blur', () => {
  const l = cur(); if (!l || !$('title').classList.contains('taken')) return;
  l.title = titleAtFocus; $('title').value = titleAtFocus; $('title').classList.remove('taken');
  showTaken(false); touch(); renderSidebar();
});
$('title').addEventListener('input', e => {
  const l = cur(); if (!l) return;
  capFirst($('title'), l.title || '', e);
  const taken = titleTaken($('title').value, l.id, !!l.isTemplate);
  $('title').classList.toggle('taken', taken);
  showTaken(taken);
  if (taken) return;
  l.title = $('title').value; touch();
  const link = $('lists').querySelector('.list-link[aria-current="true"] .t');
  if (link) { link.textContent = l.title.trim() || 'Untitled'; link.classList.toggle('untitled', !l.title.trim()); }
});
$('title').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const l = cur(); if (!l) return;
  if (l.items[0]) { pendingFocus = { id: l.items[0].id }; renderEditor(); } else apply(L.addAtEnd(l));
});
for (const [id, fn] of [['indentBtn', L.indent], ['outdentBtn', L.outdent]]) {
  const b = $(id);
  b.addEventListener('mousedown', e => e.preventDefault()); // keep the cursor in the item
  b.addEventListener('click', () => {
    const l = cur(); if (!l) return;
    if (!lastFocusId || !L.find(l, lastFocusId)) { banner = { type: 'info', title: 'Tap into an item first, then use this button.', msgs: [] }; return renderBanner(); }
    apply(fn(l, lastFocusId));
  });
}
const updateOnline = () => { $('offline').hidden = navigator.onLine; };
addEventListener('online', updateOnline); addEventListener('offline', updateOnline); updateOnline();
narrow.addEventListener('change', () => { if (!narrow.matches) setView('list'); renderSidebar(); });
addEventListener('resize', () => document.querySelectorAll('.row textarea').forEach(autosize));
