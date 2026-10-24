# CLAUDE.md

Guidance for Claude when working in this repository.

## About the project

Actinerary is a Notes-style checklist web app. You rank items by typing a number at the start of each line, then tap **Sort** to put them in sequence. It syncs across devices with Google sign-in and installs as an app on iPhone, Android, Mac, and PC.

- Live app: https://actinerary.app
- Repo: https://github.com/Vehementrr/actinerary
- Owner: Colin

`README.md` covers features and setup. `DECISIONS.md` records every product and technical decision and the reason for it. Treat `DECISIONS.md` as the source of truth for how the app should behave.

## Working with Colin

- **One step at a time.** When Colin has to do something himself (Terminal, Firebase console, Google Cloud, Cloudflare, GitHub), give one step, then wait for him to finish before giving the next.
- **Show doc changes before making them.** For `README.md` and `DECISIONS.md`, list the proposed changes in the chat and wait for approval. Change only what was approved, and don't change formatting he didn't ask about.
- **Brainstorming means no action.** When Colin says he's brainstorming or collaborating, discuss and ask questions. Don't build or edit anything.
- **Use only reasons Colin gave.** In `DECISIONS.md`, record his reasons. If he made a call without one, record the decision without inventing a reason.
- **Dates are MM/DD/YYYY**, like 10/24/2026, everywhere.
- **Explain plainly.** Skip jargon, or explain it when it's needed.

## Project facts that look like mistakes but aren't

- The Firebase project ID is `actionary-b6dff`, with the app's old name. Project IDs are permanent. Don't rename it or "fix" it in `firebase-config.js` or `.firebaserc`.
- `public/firebase-config.js` is public by design. The API key is a Firebase web key restricted to the app's own addresses. GitHub's secret scanning flags it, and those alerts are closed as false positives.
- Sign-in runs through the same address the app is opened from. `authDomain` is `actinerary.app` on the main domain and `actionary-b6dff.firebaseapp.com` elsewhere. iPhone home-screen apps can't sign in if these don't match.
- The old addresses, `actionary-b6dff.firebaseapp.com` and `actionary-b6dff.web.app`, still work. Browser tabs there redirect to actinerary.app. Apps installed from them show a note to reinstall.

## Code layout

```
public/              The app (what gets hosted)
  index.html         Page structure
  styles.css         Look and layout
  app.js             Screens, editing, and saving
  logic.js           Sorting and checking rules. Pure functions, no DOM or Firebase.
  store.js           Google sign-in and Firestore sync
  firebase-config.js Firebase project settings (public)
  sw.js              Offline support. Bump VERSION on every deploy.
  manifest.webmanifest, icons/   App install
firestore.rules      Each user can only read and write users/{their uid}/lists
firebase.json        Hosting and rules config
```

Plain HTML, CSS, and JavaScript modules. No build step. The Firebase SDK loads from gstatic.com, pinned to one version in `store.js` and `sw.js`.

## Security rules

- Never create, download, or commit a service account key (a JSON file containing `"private_key"`).
- Never loosen `firestore.rules` beyond "each signed-in user can only reach their own data." New collections get the same per-user rule.
- Keep rules compatible with both the current and previous app version, so rolling back the app never requires rolling back the rules.

## Release routine

Colin approves each of these steps. Never deploy, push, or tag without his go-ahead.

1. Test locally first. Use fake data where possible; see "Local testing" below.
2. In `public/sw.js`, bump the number at the end of `VERSION`.
3. Deploy: `firebase deploy --only hosting` (add `,firestore:rules` if the rules changed).
4. Colin checks the live app on his Mac and iPhone.
5. Commit and push, then tag: `git tag vX.Y` and `git push origin vX.Y`.
6. Add an entry to `DECISIONS.md` for any new decision.

**Rollback:** Firebase console → Hosting → Release history → Roll back. Git tags mark each released version. Rolling back doesn't undo data already saved, so new features should add data rather than rewrite it.

## Local testing

- `firebase emulators:start --only hosting` serves the app at http://localhost:5050. It uses the **real** database.
- Planned: full Firebase emulators (fake database and sign-in) for testing new features. This needs Java installed.

## Environment notes

- Colin's Mac needed `sudo` for `npm install -g`.
- The domain is registered at Cloudflare. Its DNS records for Firebase must stay **DNS only** (gray cloud), not proxied.

## Current status (10/24/2026)

- **Live:** v1.2 at actinerary.app.
