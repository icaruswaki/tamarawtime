# Tamaraw Time — Cloud Pilot v3

A multi-device student planner and three-day usability pilot for FEU students. It runs on GitHub Pages and stores student planner information and feedback **in a Supabase cloud database**, not in localStorage. Individual email/password accounts are used for access.

## What is included

- `index.html`: app UI, registration, sign-in, onboarding, settings, planner, study feedback.
- `styles.css`: FEU-themed responsive desktop/mobile interface.
- `app.js`: planner, tutorial, progress tracking, cloud save integration.
- `cloud-store.js`: Supabase API integration; private student rows.
- `cloud-config.js`: **must be configured** with your Supabase project URL and **publishable** (public client) key.
- `schema.sql`: creates secure tables, Row-Level Security (RLS) policies, and database-enforced 3-day feedback eligibility.
- `research-summary.sql`: optional research report query, for the **Supabase SQL Editor only**, not the public website.

## Quick setup (GitHub Pages + Supabase)

1. Create a project at <https://supabase.com/dashboard>. Choose a database region; set a strong dashboard/database password.
2. Open **SQL Editor > New query**. Paste `schema.sql`, then click **Run** **once**. It creates the student planner, action logs, and feedback tables.
3. Open your project **Connect** or **Project Settings > API Keys** and locate the **Project URL** and **publishable** key (`sb_publishable_...`). If your project still displays a legacy `anon` public key, it can also be used. **Do not use a `secret` or `service_role` key in browser code.**
4. Open `cloud-config.js`. Replace the two placeholder values with your project URL and publishable key. These are designed to be public; access control is enforced by database RLS.
5. Under **Authentication > Providers**, enable Email authentication. For real pilot respondents, leave email confirmations enabled. Depending on your project settings, email verification may be required on sign-up. Configure **Authentication > URL Configuration**: set **Site URL** to your published GitHub Pages URL, and add its URL as an allowed Redirect URL so confirmation links return to the app.
6. Upload all five website files (`index.html`, `styles.css`, `app.js`, `cloud-store.js`, `cloud-config.js`; plus `README.md` if desired) to your GitHub Pages repository. You do **not** need to publish `schema.sql` or `research-summary.sql` (they are safe to include but not needed by the website). Wait for GitHub Pages to redeploy, then reload the site.
7. Register one test student account, check email if confirmation is required, log in, complete onboarding, create a real task, and reload or log in on another device to verify that the task remains.

GitHub Pages hosts only static files. **Before completing steps 1–6, the app cannot save cloud data; the login screen intentionally shows an explanation instead of pretending data is saved.** This package is ready to configure but is not connected to your Supabase account.

## Three-day feedback eligibility

- Students must sign in and perform at least one meaningful action on **three distinct Philippine calendar dates**. The dates need not be consecutive.
- Meaningful actions include adding/deleting classes or tasks, completing tasks, saving changed commute/preference settings, opening Google Maps, and successful GPS checks. Merely visiting the website or viewing the tutorial doesn't count.
- The server records event timestamps; the browser cannot select or edit `occurred_at` via the public API, and ordinary student accounts cannot delete or alter those logs.
- The **3-day rule is also checked by a database policy** whenever a feedback record is submitted, not just by hiding the feedback form in the browser.
- A person could still intentionally manufacture actions across three days. This is evidence supporting research screening, **not proof of real-world attendance, attention or identity**. Your team must still screen participants according to your professor's instruction.

## Reviewing the pilot

Only the project administrators can review all respondents in the Supabase dashboard. Students cannot access each other's data.

1. Open Supabase > **Table Editor** to inspect `activity_events` and `feedback` after testing.
2. Or run `research-summary.sql` in **SQL Editor** to see a participant-level summary of active days, logged actions and ratings.
3. Save or export records through the dashboard according to your approved research consent and data-retention plan.

The progress screen has an optional CSV or JSON export for a **student's own record**; participants no longer need to manually export files just to submit feedback. Feedback is online as soon as it is saved.

## Storage, privacy, and limitations

- Planner items, activity logs, tutorial completion and feedback are persisted **online** in Supabase, identified by a user account.
- Supabase Auth may store a local **login session token**, to remember the sign-in. That is different from saving the planner data in the browser. The app doesn't write planner items to localStorage.
- The project owners should collect informed consent, disclose the study purpose and data collected, limit who can view results, and define when they will delete test data. Students should avoid entering confidential/personal information into task names or written feedback.
- **Reset planner only** clears classes, tasks and preferences while preserving the study activity history and feedback. No student-facing action deletes research logs. If deletion is needed, a project administrator must handle it through Supabase under the agreed privacy policy.
- Without access to an actual Supabase project, the app's cloud requests cannot be integration-tested end to end. JavaScript syntax/static checks and UI mock tests do not substitute for validating your live database and email confirmations.
- Route ETA is still based on a user-entered estimate; Google Maps opens an external route. No live Google Maps travel-time integration has been added.
- This version uses a simple cloud-saved JSON planner per user. If the same account makes conflicting edits on two devices at exactly the same time, the **last save wins**. Avoid editing on two devices simultaneously during pilot testing.

## Developer references

- Supabase JavaScript client: <https://supabase.com/docs/reference/javascript/initializing>
- Row Level Security: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Authentication: <https://supabase.com/docs/guides/auth>
