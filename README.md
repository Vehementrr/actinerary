# Actinerary

*Your day, sorted and ready for action.*

Actinerary is a Notes-style checklist where you rank tasks by typing a number at the start of each line, then tap **Sort** to put them in sequence. Sign in with Google and your lists sync between your Mac and iPhone, and keep working offline.

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

- One level deep. `Tab` / `Shift+Tab` on a Mac, or the → / ← buttons.
- Subtasks follow the same rules, scoped to their parent, and sort independently under it.
- A main task can't be checked while it has open subtasks (they're highlighted red).
- Checking the last open subtask auto-checks the main task.
- A completed main task locks its subtasks. Unchecking it pauses auto-check until a subtask is added or unchecked and all subtasks are checked again.

### Lists

- Make as many lists as you like. Each one is saved until you delete it.
- On a Mac, lists are in the sidebar. On an iPhone, tap a list to open it and **‹ Lists** to go back.

## Project layout

```
public/              The app (this is what gets hosted)
  index.html         Page structure
  styles.css         Look and layout
  app.js             Screens, editing, and saving
  logic.js           The sorting and checking rules (no Firebase, easy to test)
  store.js           Google sign-in and syncing with Firestore
  firebase-config.js Your Firebase project's public settings
  sw.js              Lets the app open offline
  manifest.webmanifest, icons/   Home-screen / Dock install
firestore.rules      Who may read and write data (only you, your own lists)
firebase.json        Hosting and rules settings for the Firebase CLI
```

## Security

- **No secrets in this repo.** `firebase-config.js` holds your project's public settings. They identify the project; they don't grant access. Every visitor's browser sees them anyway.
- **Your password never touches Actinerary.** You sign in on Google's own page. The app gets a short-lived token that's stored on your device and renewed automatically.
- **The database rules do the protecting.** `firestore.rules` lets a signed-in user read and write only `users/{their id}/lists`. Google's servers enforce this; editing the app can't get around it.
- **Never add a service account key** (a JSON file containing `"private_key"`). Actinerary doesn't need one. `.gitignore` blocks the usual filenames as a backstop.

## Setup (one time)

You need a Google account and [Node.js](https://nodejs.org) (the LTS version) installed on your Mac.

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project**. Name it `actinerary`. You can turn Google Analytics off.
2. Note the **Project ID** it shows (for example `actinerary-1a2b3`). You'll use it below.
3. Stay on the free **Spark** plan. Don't add billing.

### 2. Register the web app and copy its settings

1. In the project overview, click the web icon **`</>`** to add a web app. Nickname: `Actinerary`. Leave the Hosting checkbox off.
2. Firebase shows a `firebaseConfig = { ... }` block. Copy its six values into `public/firebase-config.js`, replacing the `PASTE_...` placeholders.

### 3. Turn on Google sign-in

**Security → Authentication → Get started → Sign-in providers → Google → Enable**, choose your support email, and **Save**.

### 4. Create the database

**Databases & Storage → Firestore → Create database**. Pick a location near you, then choose **production mode** (locked). Don't choose test mode. The deploy step below replaces the default rules with `firestore.rules`.

### 5. Install the Firebase command-line tool and connect this folder

In Terminal, from this project's folder:

```
npm install -g firebase-tools
firebase login
firebase use --add
```

`firebase use --add` lists your projects. Pick `actinerary` and type `default` as the alias. It creates a `.firebaserc` file holding only your project ID, which is safe to commit.

### 6. Deploy

```
firebase deploy --only hosting,firestore:rules
```

When it finishes, open **`https://YOUR-PROJECT-ID.firebaseapp.com`** and sign in. Use the `firebaseapp.com` address, not the `web.app` one (the app redirects there anyway; it's the address Google sign-in is set up for).

### 7. Install it as an app

- **iPhone:** open the address in Safari → click … → Share → **Add to Home Screen** → Add → Sign in with your Google account
- **Android:** open the address in Chrome → tap ⋮ → **Add to Home screen** (or **Install app**) → Install → Sign in with your Google account
- **Mac:**
  - Safari: open the address in Safari → File → **Add to Dock** → Sign in with your Google account
  - Chrome: open the address in Chrome → Click on small install icon (computer screen with down arrow) on right side of address bar → Sign in with your Google account

### 8. Check the rules (recommended)

In **Firestore Database → Rules → Rules Playground**:

- Test 1: Non-authenticated user
  - Set Simulation Type to **get**
  - Set Location to `users/someone-else/lists/x`
  - Set **authenticated** to off
  - Click Run
  - Expected result: Simulated read denied
- Test 2: Authenticated user
  - Set Simulation Type to **get**
  - Set Location to `users/abc/lists/x`
  - Set authenticated to on
  - Set Provider to `google.com` and Firebase UID as `abc`
  - Click Run
  - Expected result: Simulated read allowed

### 9. Lock the API key to your site (recommended)

In [Google Cloud Console](https://console.cloud.google.com) → your project → **APIs & Services → Credentials**, open the **Browser key (auto created by Firebase)**. Under **Application restrictions**, choose **Websites** and add:

```
https://YOUR-PROJECT-ID.firebaseapp.com/*
https://YOUR-PROJECT-ID.web.app/*
http://localhost:5050/*
```

Save.

Open App on desktop and refresh with CMD+R. Test to see app is still working as expected.

## Making changes

1. Edit files in `public/`.
2. Try it locally with `firebase emulators:start --only hosting` and open `http://localhost:5050`. (This uses your real database, not a test one.)
3. In `public/sw.js`, bump `VERSION` (for example `actinerary-v2`) so devices fetch the new files.
4. Commit and push to GitHub, then run `firebase deploy --only hosting,firestore:rules`.

Installed apps pick up a new version the next time they're opened, sometimes the time after.

## Roadmap

- Template creation with date auto-generation
- Search across lists
- Reorder lists in the sidebar
- Optional: an MCP server so an AI assistant can add and rank tasks
