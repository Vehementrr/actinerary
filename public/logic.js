// Actinerary list rules. Pure functions with no DOM or Firebase, so they can be tested on their own.
//
// A list looks like:
//   { id, title, createdAt, updatedAt, items: [ Item ] }
// A main task looks like:
//   { id, rank, text, done, autoPaused, children: [ Subtask ] }   (grand is set while it keeps an old number)
// A subtask is the same without children/autoPaused. `rank` is the number in the item's number box, or null.
//
// Most functions take the list plus a `flags` object (item id -> { kind, value }) that drives the red
// highlights, mutate both, and return { changed, banner, focus, caret }. `banner` undefined means "leave it".
// A banner's `clears` names the kind of red highlight that closing it removes.

// Reads a number at the start of text, the way items stored their number before v1.6.
export const num = t => {
  const m = /^\s*(\d+)(?=\s|$)/.exec(t || '');
  return m ? parseInt(m[1], 10) : null;
};
export const short = t => {
  const s = (t || '').trim() || 'Untitled';
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
};
export const uid = () => {
  const a = new Uint8Array(8);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, b => (b % 36).toString(36)).join('');
};

export function makeItem(text = '', isChild = false) {
  const it = { id: uid(), rank: null, text, done: false };
  if (!isChild) { it.children = []; it.autoPaused = false; }
  return it;
}
export function makeList(title = '') {
  const now = Date.now();
  return { id: uid(), title, createdAt: now, updatedAt: now, items: [makeItem('')] };
}

export function find(list, id) {
  for (const it of list.items) {
    if (it.id === id) return { item: it, parent: null, arr: list.items };
    for (const c of it.children || []) if (c.id === id) return { item: c, parent: it, arr: it.children };
  }
  return null;
}
export function visibleOrder(list) {
  const out = [];
  list.items.forEach(it => { out.push(it.id); (it.children || []).forEach(c => out.push(c.id)); });
  return out;
}
export function counts(list) {
  let open = 0, done = 0;
  list.items.forEach(it => { if (!it.text.trim() && !(it.children || []).length) return; it.done ? done++ : open++; });
  return { open, done };
}

const rankKey = x => x.rank ?? Infinity;
const remove = (arr, it) => { const i = arr.indexOf(it); if (i > -1) arr.splice(i, 1); };
const err = (title, msgs = []) => ({ type: 'error', title, msgs });
const info = (title, msgs = []) => ({ type: 'info', title, msgs });

function placeDone(arr, it) {
  remove(arr, it);
  const k = rankKey(it);
  const i = arr.findIndex(x => x.done && rankKey(x) > k);
  i === -1 ? arr.push(it) : arr.splice(i, 0, it);
}
function placeOpen(arr, it) {
  remove(arr, it);
  const n = it.rank;
  const i = n != null
    ? arr.findIndex(x => x.done || x.rank == null || x.rank > n)
    : arr.findIndex(x => x.done);
  i === -1 ? arr.push(it) : arr.splice(i, 0, it);
}
function insertOpenEnd(arr, it) {
  const i = arr.findIndex(x => x.done);
  i === -1 ? arr.push(it) : arr.splice(i, 0, it);
}
const keepNumMsg = info('Completed items keep their number.', ['Uncheck it first if you need to change the number.']);
const lockedMsg = p => err(`Uncheck “${short(p.text)}” first to change its subtasks.`);

/* ---------- checking ---------- */
export function toggle(list, id, flags) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent, arr } = f;
  if (parent && parent.done) return { changed: false, banner: lockedMsg(parent) };

  if (!it.done) {
    if (!parent) {
      const open = (it.children || []).filter(c => !c.done);
      if (open.length) {
        open.forEach(c => { flags[c.id] = { kind: 'open' }; });
        return { changed: false, banner: { ...err('This task has open subtasks.', ['Check off the subtasks highlighted in red first.']), clears: 'open' } };
      }
    }
    it.done = true; delete it.grand; delete flags[it.id];
    placeDone(arr, it);
    if (parent && !parent.done && !parent.autoPaused && parent.children.every(c => c.done)) {
      parent.done = true; delete parent.grand; delete flags[parent.id];
      placeDone(list.items, parent);
    }
    return { changed: true };
  }

  it.done = false;
  if (it.rank != null) it.grand = it.rank; else delete it.grand; // may keep its old number even if it's below a completed one
  placeOpen(arr, it);
  if (!parent && it.children.length) it.autoPaused = true;
  if (parent) parent.autoPaused = false;
  return { changed: true };
}

/* ---------- sorting ---------- */
// Open numbered items go first, then unnumbered ones (flagged red), then completed ones. Open numbers close up
// with no gaps, continuing after the highest completed number, which never changes. An unchecked item keeps its
// old number while it's still free. When two open items share a number, the one numbered last goes first.
function sortGroup(arr, flags) {
  const done = arr.filter(x => x.done).sort((a, b) => rankKey(a) - rankKey(b));
  const used = new Set(done.map(x => x.rank).filter(n => n != null));
  const top = Math.max(0, ...used);
  const open = arr.filter(x => !x.done && x.rank != null)
    .sort((a, b) => a.rank - b.rank || (b.rankedAt || 0) - (a.rankedAt || 0));
  let next = top + 1, renumbered = false;
  for (const x of open) {
    if (x.grand === x.rank && x.rank < top && !used.has(x.rank)) { used.add(x.rank); continue; }
    while (used.has(next)) next++;
    if (x.rank !== next) { x.rank = next; renumbered = true; }
    used.add(next);
  }
  open.sort((a, b) => a.rank - b.rank);
  const openNone = arr.filter(x => !x.done && x.rank == null);
  const missing = openNone.filter(x => x.text.trim() || (x.children || []).length);
  missing.forEach(x => { flags[x.id] = { kind: 'none' }; });
  const before = arr.map(x => x.id).join();
  arr.splice(0, arr.length, ...open, ...openNone, ...done);
  return { missing: missing.length, changed: renumbered || before !== arr.map(x => x.id).join() };
}
// Returns fresh flags for the list.
export function sortList(list) {
  const flags = {};
  let missing = 0, changed = false;
  for (const arr of [list.items, ...list.items.map(it => it.children || [])]) {
    const r = sortGroup(arr, flags); missing += r.missing; changed = changed || r.changed;
  }
  const banner = missing
    ? { ...info(`Sorted. ${missing} item${missing > 1 ? 's have' : ' has'} no number.`, ['They’re highlighted in red at the bottom of the open items.']), clears: 'none' }
    : { type: 'ok', title: 'Sorted.', msgs: [] };
  return { changed, flags, banner };
}

/* ---------- editing ---------- */
export function setText(list, id, text) {
  const f = find(list, id); if (!f) return { ok: false };
  f.item.text = text;
  return { ok: true };
}
// The number box. Returns { ok } or { ok:false, banner }; completed items keep their number.
export function setRank(list, id, value) {
  const f = find(list, id); if (!f) return { ok: false };
  if (f.item.done) return { ok: false, banner: keepNumMsg };
  f.item.rank = /^\d+$/.test(value) ? parseInt(value, 10) : null;
  f.item.rankedAt = Date.now();
  return { ok: true };
}
// Return: the text from `end` on moves into a new item below (the text between `start` and `end` is dropped).
// At the very start of an item, a blank item goes above instead. A completed item's new item is completed too.
export function splitItem(list, id, start, end = start) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent, arr } = f;
  if (parent && parent.done) return { changed: false, banner: err(`Uncheck “${short(parent.text)}” first to add subtasks.`) };
  const head = it.text.slice(0, start), tail = it.text.slice(end);
  const n = makeItem('', !!parent);
  n.done = it.done;
  if (parent) parent.autoPaused = false;
  if (end === 0 && it.text) {
    arr.splice(arr.indexOf(it), 0, n);
    return { changed: true, focus: it.id, caret: 0 };
  }
  it.text = head; n.text = tail;
  if (n.done) placeDone(arr, n);
  else arr.splice(arr.indexOf(it) + 1, 0, n);
  return { changed: true, focus: n.id, caret: 0 };
}
// Backspace at the start of an item: its text joins the end of the item above.
// Only between two open or two completed items, never on a task with subtasks or a locked subtask.
export function joinPrev(list, id, flags) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent, arr } = f;
  if ((it.children || []).length) return { changed: false };
  if (parent && parent.done) return { changed: false, banner: lockedMsg(parent) };
  const order = visibleOrder(list); const i = order.indexOf(id);
  if (i < 1) return { changed: false };
  const p = find(list, order[i - 1]);
  const above = p.item;
  if (above.done !== it.done || (p.parent && p.parent.done)) return { changed: false };
  if (!parent && it.done && !(p.parent || above).done) return { changed: false }; // not across + New item
  const caret = above.text.length;
  above.text += it.text;
  remove(arr, it); delete flags[id];
  return { changed: true, focus: above.id, caret };
}
// Drag and drop. `to` is the item's new place among the open items of its group, counted without it.
// The list is already sorted, so numbered items come first. Dropped among them, the item takes that spot's
// number and the numbers below follow on. An unnumbered item gets a number only when dropped above a numbered
// one, and a numbered item dropped among the unnumbered ones loses its number.
export function moveItem(list, id, to, flags) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent, arr } = f;
  if (it.done || (parent && parent.done)) return { changed: false };
  const open = arr.filter(x => !x.done && x !== it);
  const block = open.filter(x => x.rank != null);
  const rest = open.filter(x => x.rank == null);
  to = Math.max(0, Math.min(to, open.length));
  const before = arr.map(x => x.id + x.rank).join();
  const numbered = it.rank != null ? to <= block.length : to < block.length;
  const base = Math.min(...[...block, ...(it.rank != null ? [it] : [])].map(x => x.rank), Infinity);
  if (numbered) { block.splice(to, 0, it); delete flags[it.id]; }
  else { it.rank = null; rest.splice(Math.max(0, to - block.length), 0, it); }
  const used = new Set(arr.filter(x => x.done && x.rank != null).map(x => x.rank));
  let next = base === Infinity ? 1 : base;
  for (const x of block) {
    while (used.has(next)) next++;
    x.rank = next++;
  }
  arr.splice(0, arr.length, ...block, ...rest, ...arr.filter(x => x.done));
  return { changed: before !== arr.map(x => x.id + x.rank).join() };
}
export function addAtEnd(list) {
  const n = makeItem('');
  insertOpenEnd(list.items, n);
  return { changed: true, focus: n.id };
}
export function deleteEmpty(list, id, flags) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent, arr } = f;
  if ((it.children || []).length || (parent && parent.done)) return { changed: false };
  const order = visibleOrder(list); const i = order.indexOf(id);
  remove(arr, it); delete flags[id];
  return { changed: true, focus: order[i - 1] || order[i + 1] || null };
}
export function indent(list, id) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent } = f;
  const top = list.items;
  if (parent) return { changed: false, banner: info('Subtasks can only go one level deep.') };
  if (it.children.length) return { changed: false, banner: err('This task has its own subtasks, so it can’t become a subtask.') };
  const prev = top[top.indexOf(it) - 1];
  if (!prev) return { changed: false, banner: info('There’s no task above this one to put it under.') };
  if (prev.done) return { changed: false, banner: err(`Uncheck “${short(prev.text)}” first to add subtasks to it.`) };
  remove(top, it); delete it.children; delete it.autoPaused;
  it.done ? placeDone(prev.children, it) : insertOpenEnd(prev.children, it);
  prev.autoPaused = false;
  return { changed: true, focus: it.id };
}
export function outdent(list, id) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent } = f;
  if (!parent) return { changed: false };
  if (parent.done) return { changed: false, banner: lockedMsg(parent) };
  const top = list.items;
  remove(parent.children, it);
  it.children = []; it.autoPaused = false;
  it.done ? placeDone(top, it) : top.splice(top.indexOf(parent) + 1, 0, it);
  return { changed: true, focus: it.id };
}

/* ---------- saving ---------- */
// Items are saved with their number at the start of `text` too, the way versions before v1.6 stored it, so an
// older version still reads them correctly after a rollback. `body` holds the text without the number.
const legacyText = (rank, body) => rank == null ? body : (body ? `${rank} ${body}` : String(rank));
export function toSaved(items) {
  const one = ({ text, ...rest }) => ({ ...rest, text: legacyText(rest.rank ?? null, text), body: text });
  return items.map(it => it.children ? { ...one(it), children: it.children.map(one) } : one(it));
}
// Reads a saved item. Items saved before v1.6, or edited by an older version since, have their number
// taken out of the text into `rank`.
export function fromSaved(x) {
  const t = x.text || '';
  if (typeof x.body === 'string' && t === legacyText(x.rank ?? null, x.body)) {
    x.text = x.body; x.rank = x.rank ?? null;
  } else {
    x.rank = num(t);
    x.text = x.rank == null ? t : t.replace(/^\s*\d+\s*/, '');
  }
  delete x.body;
  return x;
}
