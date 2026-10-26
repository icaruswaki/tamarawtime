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
