import { isConfigured } from './firebase-config.js';
import * as L from './logic.js';

const $ = id => document.getElementById(id);
const SCREENS = ['loading', 'setup', 'signin', 'app'];
const show = name => SCREENS.forEach(s => { $('screen-' + s).hidden = s !== name; });
const narrow = matchMedia('(max-width: 759px)');
const CHECK = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="var(--accent-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LAST = 'actionary.lastList';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

// Sign-in is set up for the firebaseapp.com address; send the web.app twin there.
if (location.hostname.endsWith('.web.app')) {
  location.replace(location.href.replace('.web.app', '.firebaseapp.com'));
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
const sig = l => JSON.stringify([l.title || '', l.items]);
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
  stopLists = store.watchLists(u.uid, onLists, err => {
    banner = { type: 'error', title: 'Couldn’t load your lists.', msgs: [err.code === 'permission-denied'
      ? 'Permission denied. Make sure the Firestore rules are deployed (see the README).'
      : (err.message || String(err))] };
    renderBanner();
  });
}

function normalize(l) {
  l.items = Array.isArray(l.items) ? l.items : [];
  l.items.forEach(it => {
    it.children = Array.isArray(it.children) ? it.children : [];
    it.autoPaused = !!it.autoPaused; it.done = !!it.done; it.text = it.text || '';
    it.children.forEach(c => { c.done = !!c.done; c.text = c.text || ''; });
  });
  return l;
}

function onLists(incoming, removed, fromCache) {
  let currentChanged = false;
  for (const l of incoming) {
    if (timers.has(l.id)) continue; // local edits not yet saved win
    const local = lists.get(l.id);
    if (!local || sig(local) !== sig(l)) {
      lists.set(l.id, normalize(l));
      if (l.id === currentId) currentChanged = true;
    } else {
      local.updatedAt = l.updatedAt;
    }
  }
  for (const id of removed) {
    if (timers.has(id)) continue;
    lists.delete(id);
    if (id === currentId) { currentId = null; currentChanged = true; }
  }
  if (!loaded && (incoming.length || !fromCache)) {
    loaded = true;
    setView(narrow.matches ? 'index' : 'list');
    currentChanged = true;
  }
  if (currentId && !lists.has(currentId)) { currentId = null; currentChanged = true; }
  if (!currentId && lists.size) {
    const last = store_get(LAST);
    currentId = lists.has(last) ? last : sortedLists()[0].id;
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
  if (r.focus) pendingFocus = r.focus;
  renderEditor(!r.focus);
}
const blocking = flags => Object.values(flags).some(f => f.kind !== 'none');

function openList(id) {
  if (currentId && currentId !== id) flush(currentId);
  currentId = id; banner = null; $('confirmArea').innerHTML = '';
  store_set(LAST, id);
  setView('list');
  renderSidebar(); renderEditor();
}
function newList() {
  if (currentId) flush(currentId);
  const l = L.makeList('');
  lists.set(l.id, l);
  store.saveList(user.uid, l).catch(saveError);
  currentId = l.id; banner = null; store_set(LAST, l.id);
  setView('list');
  renderSidebar(); renderEditor();
  $('title').focus();
}
function askDeleteList() {
  const l = cur(); if (!l) return;
  const area = $('confirmArea'); area.innerHTML = '';
  const c = document.createElement('div'); c.className = 'confirm';
  const s = document.createElement('span');
  s.textContent = `Delete “${L.short(l.title)}”? This can’t be undone.`;
  const yes = button('Delete', 'btn primary');
  const no = button('Cancel', 'btn');
  yes.addEventListener('click', () => {
    clearTimeout(timers.get(l.id)); timers.delete(l.id);
    lists.delete(l.id); delete flagsBy[l.id];
    store.removeList(user.uid, l.id).catch(saveError);
    area.innerHTML = ''; banner = null;
    currentId = sortedLists()[0]?.id || null;
    if (narrow.matches) setView('index');
    renderSidebar(); renderEditor();
  });
  no.addEventListener('click', () => { area.innerHTML = ''; });
  c.append(s, yes, no); area.appendChild(c);
}
function setView(v) { $('screen-app').dataset.view = v; }

/* ---------- rendering: sidebar ---------- */
const sortedLists = () => [...lists.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
function renderSidebar() {
  const nav = $('lists'); nav.innerHTML = '';
  const all = sortedLists();
  if (!all.length) {
    const p = document.createElement('div'); p.className = 'none';
    p.textContent = loaded ? 'No lists yet.' : 'Loading your lists…';
    nav.appendChild(p); return;
  }
  for (const l of all) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'list-link';
    b.setAttribute('aria-current', String(l.id === currentId));
    const t = document.createElement('span'); t.className = 't' + (l.title.trim() ? '' : ' untitled');
    t.textContent = l.title.trim() || 'Untitled';
    const { open, done } = L.counts(l);
    const m = document.createElement('span'); m.className = 'm';
    m.textContent = `${open} open · ${done} done`;
    b.append(t, m);
    b.addEventListener('click', () => openList(l.id));
    nav.appendChild(b);
  }
}

/* ---------- rendering: editor ---------- */
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function button(text, cls) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; return b; }

function rowEl(it, parent, flags) {
  const row = document.createElement('div');
  const fl = flags[it.id];
  row.className = 'row' + (it.done ? ' done' : '') + (parent && parent.done ? ' locked' : '') + (fl ? ' flagged' : '');

  const cb = document.createElement('button');
  cb.className = 'check'; cb.type = 'button'; cb.innerHTML = CHECK;
  cb.setAttribute('aria-label', (it.done ? 'Uncheck ' : 'Check off ') + L.short(it.text));
  cb.addEventListener('click', () => {
    const flagsNow = F();
    const r = L.toggle(cur(), it.id, flagsNow);
    if (r.changed && banner && banner.type === 'error' && !blocking(flagsNow)) r.banner = null;
    apply(r);
  });

  const ta = document.createElement('textarea');
  ta.rows = 1; ta.value = it.text; ta.dataset.itemId = it.id;
  ta.setAttribute('aria-label', parent ? 'Subtask' : 'Task');
  ta.addEventListener('focus', () => { lastFocusId = it.id; });
  ta.addEventListener('input', () => {
    const r = L.setText(cur(), it.id, ta.value);
    if (!r.ok) {
      const f = L.find(cur(), it.id);
      const p = ta.selectionStart; ta.value = f ? f.item.text : ''; ta.setSelectionRange(Math.min(p, ta.value.length), Math.min(p, ta.value.length));
      if (r.banner) { banner = r.banner; renderBanner(); }
      return;
    }
    autosize(ta); touch();
  });
  ta.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); apply(L.newAfter(cur(), it.id)); }
    else if (e.key === 'Tab') { e.preventDefault(); apply(e.shiftKey ? L.outdent(cur(), it.id) : L.indent(cur(), it.id)); }
    else if (e.key === 'Backspace' && ta.value === '') { e.preventDefault(); apply(L.deleteEmpty(cur(), it.id, F())); }
  });

  const flag = document.createElement('span'); flag.className = 'flag';
  if (fl) flag.textContent = { dup: 'Duplicate', low: `Below #${fl.value}`, none: 'No number', open: 'Open' }[fl.kind];

  row.append(cb, ta, flag);
  return row;
}

function renderEditor(keepFocus) {
  const l = cur();
  const titleEl = $('title');
  const has = !!l;
  $('emptyState').hidden = has || !loaded;
  $('paper').hidden = !has;
  ['sortBtn', 'indentBtn', 'outdentBtn', 'deleteListBtn'].forEach(id => { $(id).disabled = !has; });
  if (!has) { $('list').innerHTML = ''; renderBanner(); return; }

  // Remember where the cursor was so a re-render (e.g. a change from another device) doesn't lose it.
  let saved = null;
  const a = document.activeElement;
  if (keepFocus && a && a.dataset && a.dataset.itemId) saved = { id: a.dataset.itemId, s: a.selectionStart, e: a.selectionEnd };

  if (document.activeElement !== titleEl) titleEl.value = l.title || '';
  const flags = F();
  const listEl = $('list'); listEl.innerHTML = '';
  const doneCount = l.items.filter(x => x.done).length;
  let labelShown = false;
  for (const it of l.items) {
    if (it.done && !labelShown) {
      const lab = document.createElement('div'); lab.className = 'section-label';
      lab.textContent = `Completed · ${doneCount}`; listEl.appendChild(lab); labelShown = true;
    }
    const g = document.createElement('div'); g.className = 'group';
    g.appendChild(rowEl(it, null, flags));
    if (it.children.length) {
      const ch = document.createElement('div'); ch.className = 'children';
      it.children.forEach(c => ch.appendChild(rowEl(c, it, flags)));
      g.appendChild(ch);
    }
    listEl.appendChild(g);
  }
  listEl.querySelectorAll('textarea').forEach(autosize);
  renderBanner();

  const focusTa = id => listEl.querySelector(`textarea[data-item-id="${id}"]`);
  if (pendingFocus) {
    const ta = focusTa(pendingFocus); pendingFocus = null;
    if (ta) { ta.focus(); const p = ta.value.length; ta.setSelectionRange(p, p); }
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
  x.addEventListener('click', () => { banner = null; renderBanner(); });
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
$('emptyNewBtn').addEventListener('click', newList);
$('deleteListBtn').addEventListener('click', askDeleteList);
$('backBtn').addEventListener('click', () => { if (currentId) flush(currentId); banner = null; setView('index'); renderSidebar(); });
$('sortBtn').addEventListener('click', () => {
  const l = cur(); if (!l) return;
  const r = L.sortList(l);
  flagsBy[l.id] = r.flags;
  apply({ changed: r.changed, banner: r.banner });
});
$('addBtn').addEventListener('click', () => { const l = cur(); if (l) apply(L.addAtEnd(l)); });
$('title').addEventListener('input', () => {
  const l = cur(); if (!l) return;
  l.title = $('title').value; touch();
  const link = $('lists').querySelector('.list-link[aria-current="true"] .t');
  if (link) { link.textContent = l.title.trim() || 'Untitled'; link.classList.toggle('untitled', !l.title.trim()); }
});
$('title').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const l = cur(); if (!l) return;
  if (l.items[0]) { pendingFocus = l.items[0].id; renderEditor(); } else apply(L.addAtEnd(l));
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
