# Actionary

*Your day, sorted and ready for action.*

Actionary is a Notes-style checklist where you rank tasks by typing a number at the start of each line, then tap **Sort** to put them in sequence.

## Status

Prototype. A single list, saved in the browser's local storage on whichever device you open it on. There's no sync between devices yet.

## How it works

- Type a whole number at the start of a line to rank it, like `3 Call the bank`. Gaps are fine.
- Nothing reorders until you tap **Sort**.
- After sorting, the order is numbered open items (low to high), then unnumbered open items (highlighted red), then completed items in number order.
- Sort refuses to run if:
  - two items at the same level share a number ("Duplicate Number", duplicates highlighted red), or
  - an open item has a number lower than the highest completed number at that level. An unchecked item may keep its old number.
- Checking an item moves it to the completed section with its number unchanged. Unchecking returns it to its numbered spot among the open items.
- Completed items' numbers are locked. Uncheck an item to change its number.

### Subtasks

- One level deep. `Tab` / `Shift+Tab` on desktop, or the Indent / Outdent buttons.
- Subtasks follow the same rules, scoped to their parent, and sort independently under it.
- A main task can't be checked while it has open subtasks (they're highlighted red).
- Checking the last open subtask auto-checks the main task.
- A completed main task locks its subtasks. Unchecking it pauses auto-check until a subtask is added or unchecked and all subtasks are checked again.

## Running it

It's a single static file with no build step. Open `index.html` in any browser.

## Roadmap

- Multiple lists, each saved until deleted
- Sync between iPhone and Mac
- Installable home-screen app (PWA)
