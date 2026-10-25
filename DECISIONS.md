# Decisions

A running log of product and technical decisions for Actinerary: what was decided, what else was considered, and why. Newest entries go at the bottom.

## Core behavior

### 1. Ranking by typing a number at the start of each item
*10/21/2026*

- **Decision:** You rank an item by typing a whole number as the first characters of its text, like `4 Call the bank`.
- **Options considered:** A separate number box at the left of each line.
- **Why:** Typing the number inline, as part of the item's text, was the preferred way to work. Trade-off accepted: any item that starts with a number, like `2 bags of mulch`, is read as a rank.

### 2. Sorting happens only when you tap Sort
*10/21/2026*

- **Decision:** Nothing reorders until you tap the **Sort** button.
- **Options considered:** Sorting automatically when you finish editing a line.
- **Why:** Prioritizing is a process. You assign numbers, change your mind, and assign different ones. The list should only reorder once you're done.

### 3. Every number is unique
*10/21/2026*

- **Decision:** No two items at the same level can share a number. Tapping Sort with a duplicate shows a "Duplicate Number" error, highlights the duplicates red, and doesn't sort.
- **Options considered:** Blocking a duplicate the moment it's typed.
- **Why:** The app builds a sequence of tasks and steps, so no two items should share a place. The check waits until Sort so you can temporarily double up numbers while reshuffling.

### 4. The app never changes your numbers
*10/21/2026*

- **Decision:** Numbers are never renumbered, and gaps are allowed (1, 3, 7, 20 sorts fine). Checking an item off moves it to the completed section with its number unchanged.
- **Options considered:** A renumber button to close gaps.
- **Why:** The goal is a list you number yourself and then sort into a fully sequenced order. Items should not be renumbered automatically.

### 5. Unnumbered items sort to the bottom and turn red
*10/21/2026*

- **Decision:** After Sort, unnumbered open items go below the numbered ones and above completed items, highlighted red. They don't stop the sort.
- **Why:** So you notice the missing number and fix it.

### 6. Completed items stay in number order
*10/21/2026*

- **Decision:** Completed items sit at the bottom in number order, not in the order you finished them. A completed item's number can't be edited until you uncheck it. Unchecking returns it right away to its numbered spot among the open items.
- **Why:** The point of the app is a sequenced order. If an item's number needs to change, it isn't really done yet.

### 7. No new number lower than a completed item's
*10/21/2026*

- **Decision:** When you tap Sort, an open item numbered lower than the highest completed number is flagged red with "Number must be higher than #X (completed)." An item you uncheck keeps its original number without triggering this.
- **Why:** The rule applies to numbers you assign, not to ones an item already had before it was completed.

### 8. Subtasks
*10/21/2026*

- **Decision:**
  - One level of subtasks only. Indent and outdent work by using Tab / Shift+Tab or the app arrow buttons on a computer, and by using the app arrow buttons on a mobile device.
  - Subtasks follow the same rules as main tasks, scoped to their parent, and sort independently without touching the main tasks' numbers.
  - A main task can't be checked while it has open subtasks. Trying shows an error and highlights the open subtasks red.
  - Checking the last open subtask automatically checks the main task.
  - A completed main task locks its subtasks. Unchecking it pauses auto-check until a subtask is added or unchecked and all subtasks are checked again.
- **Why:** A main task isn't done until its steps are done, and you need a way to reopen a task without it immediately re-checking itself.

## Platform and infrastructure

### 9. A web app, prototyped in the browser first
*10/21/2026*

- **Decision:** Build a web app, starting with a browser prototype to test the sorting behavior.
- **Options considered:** A native SwiftUI app (needs Xcode, reinstalling every 7 days without a $99/year Apple developer account).
- **Why:** A web app needed no Xcode or fees and works on both devices. A browser prototype allowed testing the sorting behavior before building sync.

### 10. Installable app, not a webpage
*10/21/2026*

- **Decision:** Ship as an installable web app (PWA): Home Screen on iPhone and Android, Dock on Mac, Start menu on Windows.
- **Why:** It should open as an app in its own window, not as a browser tab.

### 11. Firebase with Google sign-in
*10/21/2026*

- **Decision:** Firebase (Firestore database, Authentication, Hosting) with Google sign-in.
- **Options considered:** Supabase. Email sign-in links. Sign in with Apple (needs the $99/year developer account).
- **Why:** Firestore has offline support and live sync built in, so lists work without signal and sync on reconnect. Google sign-in is the simplest setup and brings Google's two-factor protection with it.

### 12. Each person's lists are private to them
*10/22/2026*

- **Decision:** Anyone can sign in with their own Google account and gets their own private lists, synced across their own devices. Nobody can see, edit, or add to anyone else's lists.
- **Options considered:** Locking the whole database to one account.
- **Why:** Friends should be able to use the app with their own data, while each person's lists stay theirs alone.

### 13. Security approach
*10/21/2026*

- **Decision:**
  - No secrets in the repo. The Firebase web config is public by design and identifies the project without granting access.
  - Database rules, enforced on Google's servers, are the real protection. The database was created in production (locked) mode, never test mode.
  - The API key is restricted to the app's own web addresses.
  - Passwords never touch the app. Sign-in happens on Google's page.
- **Why:** Concern about credentials exposed in public repos. GitHub later flagged the Firebase key (10/22/2026); it was reviewed and closed as a false positive, since the key is public by design and already restricted.

### 14. Hosting on Firebase instead of GitHub Pages
*10/21/2026*

- **Decision:** Host on Firebase Hosting. GitHub holds the code.
- **Options considered:** GitHub Pages.
- **Why:** Google sign-in in installed iPhone apps is only reliable when the app and its sign-in run on the same web address. Firebase Hosting provides that.

### 15. GitHub kept in step with production
*10/22/2026*

- **Decision:** Every deploy is also committed and pushed to GitHub.
- **Why:** So the code could be rebuilt somewhere else, or turned into an App Store app, later. User data and console settings live outside the repo; the README documents the settings.

### 16. Rollback and testing before release
*10/22/2026*

- **Decision:**
  - Tag each released version in git (`v1.0`, `v1.1`, ...).
  - Use Firebase Hosting's release history to roll the live app back in seconds.
  - Keep database rules compatible with both the old and new app, so rolling back the app doesn't require rolling back the rules.
  - Make new features add data rather than rewrite it.
  - Test new features locally against Firebase's emulators, with a fake database and fake sign-in. (Not set up yet; needs Java.)
- **Options considered:** Testing locally against the real database.
- **Why:** Rollback procedures should be in place before changing production, and testing with fake data keeps real lists safe.

## Naming

### 17. Rename from Actionary to Actinerary
*10/22/2026*

- **Decision:** Rename the app to Actinerary and use actinerary.app as its address. The slogan stays: "Your day, sorted and ready for action."
- **Why:** While registering actionary.app, an existing app called Actionary turned up. App Store, Google Play, USPTO trademark, and web searches for "Actinerary" came back clear.

### 18. Keep the original Firebase project
*10/22/2026*

- **Decision:** Keep the existing Firebase project, whose permanent ID still says `actionary`, and hide it behind the custom domain.
- **Options considered:** Creating a new Firebase project with a matching ID.
- **Why:** A new project meant redoing setup and leaving existing lists behind. With actinerary.app connected and sign-in running through it, the old ID only appears in the console and config.

### 19. Sign-in runs through actinerary.app
*10/22/2026*

- **Decision:** actinerary.app is the app's main address, and Google sign-in runs through it. The old Firebase addresses keep working: browser tabs there redirect to actinerary.app, and apps installed from them show a note to reinstall from actinerary.app.
- **Options considered:** Leaving sign-in on the original firebaseapp.com address.
- **Why:** With sign-in on the old address, the iPhone home-screen app installed from actinerary.app couldn't sign in, and Google's sign-in screen showed "continue to actionary-b6dff…", which exposed the old project ID.

## Templates and Completed Lists (specified, not yet built)

### 20. Templates
*10/22/2026*

- **Decision:**
  - Templates are reusable lists in their own collapsible sidebar section. They're edited like a list, including Sort, but have no checkboxes.
  - Create one from scratch with **+** next to the Templates heading, or from any list with **Save as template**, which drops a trailing date from the name.
  - **+ New list** offers a blank list or any template. You pick the date (default today), and the new list is titled with the template name plus the date in MM/DD/YYYY format, like "Morning Routine 10/22/2026."
  - Editing a template only affects lists created afterward.
- **Not included for now:** Two same-day lists from one template. Automatically created daily lists (needs Firebase's paid plan).
- **Why:** Reuse a routine, like a morning routine, every day without unchecking and rechecking the same list.

### 21. Completed Lists
*10/22/2026*

- **Decision:**
  - Any list can be finished with **Mark List Complete**. The button is grayed out until every item is checked.
  - Completed lists move to a Completed Lists section, collapsed by default and newest first.
  - Completed lists are view-only until you tap **Reopen list**.
- **Options considered:** Completing a list automatically when the last item is checked.
- **Why:** Marking a list complete by hand is more satisfying, and it keeps dated daily lists from piling up in the main list.
