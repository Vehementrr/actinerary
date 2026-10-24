# Actinerary

*Your day, sorted and ready for action.*

Actinerary is a Notes-style checklist where you rank tasks by typing a number at the start of each line, then tap **Sort** to put them in sequence. Sign in with Google and your lists sync across your devices (Mac, PC, iPhone, Android), and keep working offline.

Use it at [actinerary.app](https://actinerary.app).

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

- One level deep. `Tab` / `Shift+Tab` on a computer, or the → / ← buttons.
- Subtasks follow the same rules, scoped to their parent, and sort independently under it.
- A main task can't be checked while it has open subtasks (they're highlighted red).
- Checking the last open subtask auto-checks the main task.
- A completed main task locks its subtasks. Unchecking it pauses auto-check until a subtask is added or unchecked and all subtasks are checked again.

### Lists

- Make as many lists as you like. Each one is saved until you delete it.
- On a computer, lists are in the sidebar. On a phone, tap a list to open it and **‹ Lists** to go back.
- Delete a list with **Delete list**. It asks you to confirm first.
- Sign out is at the bottom of the sidebar on a computer, or the bottom of your lists on a phone.

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
.firebaserc          Which Firebase project this folder deploys to
DECISIONS.md         Log of product and technical decisions
```

## Security

- **No secrets in this repo.** `firebase-config.js` holds your project's public settings. They identify the project; they don't grant access. Every visitor's browser sees them anyway.
- **Your password never touches Actinerary.** You sign in on Google's own page. The app gets a short-lived token that's stored on your device and renewed automatically.
- **The database rules do the protecting.** `firestore.rules` lets a signed-in user read and write only `users/{their id}/lists`. Google's servers enforce this; editing the app can't get around it.
- **The API key is locked to the app's own web addresses** (setup step 9). GitHub's secret scanning may flag the key in `firebase-config.js`. It's a Firebase web key, public by design, so the alert can be closed as a false positive.
- **Never add a service account key** (a JSON file containing `"private_key"`). Actinerary doesn't need one. `.gitignore` blocks the usual filenames as a backstop.

## Setup (one time)

You need a Google account and [Node.js](https://nodejs.org) (the LTS version) installed on your Mac.

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project**. Name it `actinerary`. You can turn Google Analytics off.
2. Note the **Project ID** it shows (for example `actinerary-1a2b3`). You'll use it below.
3. Stay on the free **Spark** plan. Don't add billing.

### 2. Register the web app and copy its settings

1. In the project overview, click the web icon **`</>`** to add a web app. Nickname: `Actinerary`. Leave the Hosting checkbox off.
2. Firebase shows a `firebaseConfig = { ... }` block. Copy its six values into `public/firebase-config.js`, replacing the values that are there.

### 3. Turn on Google sign-in

**Security → Authentication → Get started → Sign-in providers → Google → Enable**, set the public-facing name to `Actinerary`, choose your support email, and **Save**.

### 4. Create the database

**Databases & Storage → Firestore → Create database**. Pick a location near you, then choose **production mode** (locked). Don't choose test mode. The deploy step below replaces the default rules with `firestore.rules`.

### 5. Install the Firebase command-line tool and connect this folder

In Terminal, from this project's folder:

```
npm install -g firebase-tools
firebase login
firebase use --add
```

If `npm install` fails with a permission error (`EACCES`), run it again as `sudo npm install -g firebase-tools` and enter your Mac password.

`firebase use --add` lists your projects. Pick your project ID (for example `actinerary-1a2b3`) and type `default` as the alias. It creates a `.firebaserc` file holding only your project ID, which is safe to commit.

### 6. Deploy

```
firebase deploy --only hosting,firestore:rules
```

When it finishes, open your custom domain (for Actinerary, **`https://actinerary.app`**) and sign in. Before a custom domain is connected, use **`https://YOUR-PROJECT-ID.firebaseapp.com`** instead.

### 7. Install it as an app

- **iPhone:** open the address in Safari → click … → Share → **Add to Home Screen** → Add → Sign in with your Google account
- **Android:** open the address in Chrome → tap ⋮ → **Add to Home screen** (or **Install app**) → Install → Sign in with your Google account
- **Mac:**
  - Safari: open the address in Safari → File → **Add to Dock** → Sign in with your Google account
  - Chrome: open the address in Chrome → Click on small install icon (computer screen with down arrow) on right side of address bar → Sign in with your Google account
- **Windows PC:** open the address in Chrome → click the install icon on the right side of the address bar → Sign in with your Google account. In Edge: ⋯ → **Apps** → **Install this site as an app**.

### 8. Check the rules (recommended)

In **Databases & Storage → Firestore → Rules → Rules Playground**:

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
https://actinerary.app/*
http://localhost:5050/*
```

Save.

Open App on desktop and refresh with CMD+R. Test to see app is still working as expected.

## Making changes

1. Edit files in `public/`.
2. Try it locally with `firebase emulators:start --only hosting` and open `http://localhost:5050`. (This uses your real database, not a test one.)
3. In `public/sw.js`, bump the number at the end of `VERSION` (for example `actinerary-v2` → `actinerary-v3`) so devices fetch the new files.
4. Deploy with `firebase deploy --only hosting` (add `,firestore:rules` if the rules changed), check the live app, then commit, push, and tag.

Installed apps pick up a new version the next time they're opened, sometimes the time after.

## Releases and rollback

- Tag each release after deploying: `git tag v1.2`, then `git push origin v1.2`.
- To roll back the live app, go to **Hosting → Release history** in the Firebase console and click **Roll back** on the previous version.
- Rolling back the app doesn't undo data already saved.
