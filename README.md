# Tamaraw Time — Student Web App (Pilot Upgrade)

A responsive, no-installation student time-management app for FEU students. This version adds a **first-use tutorial**, **activity progress logging**, and a **three-active-day feedback form**, while retaining the original schedule, task, commute, and Settings features. The decorative Palette card remains removed.

## Quick start

1. Extract `Tamaraw_Time_Pilot_Upgrade.zip`.
2. Open `index.html` with a modern web browser; no Node.js, database or build step is needed.
3. Complete or skip the five-step first-use walkthrough.
4. Open **Class Schedule** to enter your subjects, **Tasks & Deadlines** for schoolwork, and **Commute Planner** to configure your expected journey and leave-by time.
5. Select **My Progress** to see the activity log, days of use, and three-day feedback status.

For consistent use across multiple days, hosting the app via **GitHub Pages** (HTTPS) is recommended, rather than opening different downloaded files on different devices. Keep using the **same device, browser and site address** for the pilot.

## New in this version

### 1. First-use tutorial
- A five-step onboarding popup appears automatically when there is no prior completion flag.
- Explains the dashboard, classes, tasks, commute plan, and the 3-day testing process.
- **Next**, **Back**, **Skip** and **Start using app** controls.
- Replay anytime from **Settings → Replay app tutorial**.

### 2. Activity tracking
- Logs local timestamps when users **add/delete classes**, **add/complete/reopen/delete tasks**, **change preference or commute values**, **open Google Maps**, or **successfully check GPS**.
- Passive page visits, opening the walkthrough, exporting data, and saving unchanged settings **do not** count as active use.
- Counts **distinct local calendar dates** with at least one qualifying event, not number of site opens or consecutive days.
- Shows active-day milestone cards, action count, current task completions, and a recent activity list.
- Available exports: CSV with dated activity events and JSON containing the entire local state plus any saved pilot feedback.

### 3. Feedback eligibility
- The in-app research feedback form becomes available after **three distinct active days** (not necessarily consecutive).
- Collects optional anonymous respondent code, overall experience (1–5), ease of use (1–5), most helpful feature, and written suggestions.
- Feedback is **saved locally only**. A student needs to export the JSON and share it with the research group; saving the form does **not** submit it to an online server.

## Suggested 3-day pilot instructions for class

- **Day 1:** Open Tamaraw Time, view the tutorial, add your actual class timetable, and/or add a task.
- **Day 2:** Use a feature such as marking a task complete, adding another assignment, or planning a route.
- **Day 3:** Use the app again, confirm **My Progress** shows at least three active dates, complete the feedback form, and export the full JSON record.

Use the app naturally rather than clicking actions solely to earn participation credit. **Only include feedback respondents who actually used the app.** The app records local activity but **cannot independently verify identity or authenticity**. The study team should confirm its participant inclusion criteria separately and note the limitations of self-stored logs.

## Storage and privacy

Data (classes, tasks, settings, walkthrough completion, activity logs, and feedback) is stored in your browser via `localStorage`. No analytics service, server, cloud sync or automatic researcher submission is provided. Deleting site data, resetting the app, or switching browsers/devices will erase or separate records. Existing data under the prior app storage key is retained when upgrading on the **same website/browser**.

Avoid entering sensitive personal data or complete names in research respondent codes. Exported files may contain task titles, class names, and student settings; handle shared JSON files accordingly. Local browser data and exports can be modified and are **not audit-proof**.

## Existing features and limitations

- Dashboard: next class, pending work, preparation/departure recommendations.
- Weekly class timetable; task tracking with deadline, priority, and completion.
- Commute planner: manual estimated minutes, preparation, and arrival buffer; Google Maps routing and optional GPS check.
- No live traffic ETA; Maps may use location permission but doesn't supply live travel time back to the app.
- No system-level alarm or guaranteed push notifications.
- GPS generally requires HTTPS or localhost. Basic use works offline, but Google Maps requires connectivity.
- No FEU portal integration or online user accounts.

## GitHub Pages deployment

Replace the existing root files with `index.html`, `styles.css`, and `app.js`, commit them to the Pages publishing branch/folder, and visit your existing site URL. Keep all three files together. Existing users should refresh the page. The index includes versioned asset references to help avoid stale cached JavaScript.

## Included files

- `index.html`: shell, navigation, forms, tutorial dialog
- `styles.css`: visual styles, responsive layout, tutorials, progress elements
- `app.js`: app features, logging, onboarding, export and feedback logic
- `README.md`: this usage, testing, and deployment guide
