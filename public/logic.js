// Actinerary list rules. Pure functions with no DOM or Firebase, so they can be tested on their own.
//
// A list looks like:
//   { id, title, createdAt, updatedAt, items: [ Item ] }
// A main task looks like:
//   { id, text, done, autoPaused, children: [ Subtask ] }   (grand is set while it keeps an old number)
// A subtask is the same without children/autoPaused.
//
// Most functions take the list plus a `flags` object (item id -> { kind, value }) that drives the red
// highlights, mutate both, and return { changed, banner, focus, caret }. `banner` undefined means "leave it".

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
  const it = { id: uid(), text, done: false };
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

const rankKey = x => { const n = num(x.text); return n === null ? Infinity : n; };
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
  const n = num(it.text);
  const i = n !== null
    ? arr.findIndex(x => x.done || num(x.text) === null || num(x.text) > n)
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
        return { changed: false, banner: err('This task has open subtasks.', ['Check off the subtasks highlighted in red first.']) };
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
  const n = num(it.text);
  if (n !== null) it.grand = n; else delete it.grand; // may keep its old number even if it's below a completed one
  placeOpen(arr, it);
  if (!parent && it.children.length) it.autoPaused = true;
  if (parent) parent.autoPaused = false;
  return { changed: true };
}

/* ---------- sorting ---------- */
function validate(arr, scope, flags, errs) {
  const byNum = new Map();
  arr.forEach(x => { const n = num(x.text); if (n !== null) (byNum.get(n) || byNum.set(n, []).get(n)).push(x); });
  for (const [n, xs] of byNum) if (xs.length > 1) {
    xs.forEach(x => { flags[x.id] = { kind: 'dup' }; });
    errs.dup.push(`#${n} is used ${xs.length} times${scope}.`);
  }
  const doneNums = arr.filter(x => x.done).map(x => num(x.text)).filter(n => n !== null);
  if (!doneNums.length) return;
  const max = Math.max(...doneNums);
  arr.filter(x => !x.done).forEach(x => {
    const n = num(x.text);
    if (n !== null && n < max && x.grand !== n && !(flags[x.id] && flags[x.id].kind === 'dup')) {
      flags[x.id] = { kind: 'low', value: max };
      const m = `Number must be higher than #${max} (completed)${scope}.`;
      if (!errs.low.includes(m)) errs.low.push(m);
    }
  });
}
function sortGroup(arr, flags) {
  const openNum = arr.filter(x => !x.done && num(x.text) !== null).sort((a, b) => num(a.text) - num(b.text));
  const openNone = arr.filter(x => !x.done && num(x.text) === null);
  const done = arr.filter(x => x.done).sort((a, b) => rankKey(a) - rankKey(b));
  const missing = openNone.filter(x => x.text.trim() || (x.children || []).length);
  missing.forEach(x => { flags[x.id] = { kind: 'none' }; });
  const before = arr.map(x => x.id).join();
  arr.splice(0, arr.length, ...openNum, ...openNone, ...done);
  return { missing: missing.length, moved: before !== arr.map(x => x.id).join() };
}
// Returns fresh flags for the list.
export function sortList(list) {
  const flags = {};
  const errs = { dup: [], low: [] };
  validate(list.items, '', flags, errs);
  list.items.forEach(it => validate(it.children || [], ` under “${short(it.text)}”`, flags, errs));
  if (errs.dup.length || errs.low.length) {
    return {
      changed: false, flags,
      banner: err(errs.dup.length ? 'Duplicate Number' : 'Number too low',
        [...errs.dup, ...errs.low, 'Fix the items highlighted in red, then tap Sort again.']),
    };
  }
  let missing = 0, moved = false;
  for (const arr of [list.items, ...list.items.map(it => it.children || [])]) {
    const r = sortGroup(arr, flags); missing += r.missing; moved = moved || r.moved;
  }
  const banner = missing
    ? info(`Sorted. ${missing} item${missing > 1 ? 's have' : ' has'} no number.`, ['They’re highlighted in red at the bottom of the open items.'])
    : { type: 'ok', title: 'Sorted.', msgs: [] };
  return { changed: moved, flags, banner };
}

/* ---------- editing ---------- */
// Returns { ok } or { ok:false, banner } for a text change; refuses number changes on completed items.
export function setText(list, id, text) {
  const f = find(list, id); if (!f) return { ok: false };
  if (f.item.done && num(text) !== num(f.item.text)) {
    return { ok: false, banner: keepNumMsg };
  }
  f.item.text = text;
  return { ok: true };
}
// Return: the text from `end` on moves into a new item below (the text between `start` and `end` is dropped).
// At the very start of an item, a blank item goes above instead. A completed item's new item is completed too.
export function splitItem(list, id, start, end = start) {
  const f = find(list, id); if (!f) return { changed: false };
  const { item: it, parent, arr } = f;
  if (parent && parent.done) return { changed: false, banner: err(`Uncheck “${short(parent.text)}” first to add subtasks.`) };
  const head = it.text.slice(0, start), tail = it.text.slice(end);
  if (it.done && num(head) !== num(it.text) && end > 0) return { changed: false, banner: keepNumMsg };
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
  const text = above.text + it.text;
  if (above.done && num(text) !== num(above.text)) return { changed: false, banner: keepNumMsg };
  above.text = text;
  remove(arr, it); delete flags[id];
  return { changed: true, focus: above.id, caret };
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
