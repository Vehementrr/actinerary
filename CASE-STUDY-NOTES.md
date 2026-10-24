# Case study notes

Story moments for a future Actinerary case study: problems, surprises, and turning points that aren't decisions. Decisions and their reasons are in DECISIONS.md. Add one or two lines per moment, newest at the bottom.

- **10/21/2026:** The starting problem: I use Notes on iPhone and Mac for task lists, always as checklists. I wanted to write items in any order, number them by priority, and have the list sort itself. No app I could find did that.
- **10/21/2026:** Worked out the spec through several rounds of questions and answers before any code was written, then tested the sorting in a browser prototype before building sync.
- **10/21/2026:** Pushed back on security before going live, worried about credentials exposed in a public repo. That led to locked database rules, a restricted API key, and no secrets in the repo.
- **10/21/2026:** During setup, switched to one-step-at-a-time instructions after getting too many steps at once.
- **10/22/2026:** Set up rollback procedures (version tags, Firebase release history) before making further changes to production.
- **10/22/2026:** While registering actionary.app, found an existing app already named Actionary. Checked the App Store, Google Play, US trademarks, and the web, then renamed the app Actinerary and bought actinerary.app.
- **10/22/2026:** GitHub flagged the Firebase key as an exposed secret. Confirmed it's public by design and already restricted, and closed the alert as a false positive.
- **10/22/2026:** Rewrote the README setup instructions myself, based on going through the setup hands-on.
- **10/22/2026:** After moving to actinerary.app, the iPhone app couldn't sign in. Fixed by moving sign-in onto the new domain.
- **10/23/2026:** Check-offs on my phone weren't showing up on my laptop. Checking the database showed the phone's changes hadn't been sent yet, and they arrived after the app restarted. Fix still to be decided.
- **10/24/2026:** Running the project's own roadmap, about 15 prioritized items, as a list in Actinerary.
- **10/24/2026:** Moved from chat to the Claude desktop app working directly in the repo, and added CLAUDE.md so each session starts with the project's context and my working preferences.
