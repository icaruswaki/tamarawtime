# Tamaraw Time v8 — Live GPS + OSM-backed Jeepney Mode

**NEW:** The Jeepney mode now checks real OpenStreetMap route relations with mapped stops, only shows directionally plausible direct jeepney connections, and offers Sakay.ph when data is insufficient. See **JEEPNEY_MODE.md** for limitations and deployment.

# Previous v7 design improvements

## Changes based on student feedback

- **Animation**: New page transitions, staggered dashboard cards, visual tutorial transitions, route and GPS effects, animated guide demonstrations. Respects `prefers-reduced-motion`.
- **Color schemes**: FEU Forest, Coastal Blue, Golden Hour, and Midnight. Choose in **Settings → Color scheme → Save settings**. The selected theme is stored in the existing Supabase `app_states.payload.settings.theme` field (no database migration required).
- **Visual tutorial**: Five illustrated mini-screens in a walkthrough, rather than paragraphs of instructions. Replay in Settings.
- **AM/PM controls**: Explicit, strongly highlighted 12-hour AM/PM switches for *class start and end* in the Add Class dialog. Converts to 24-hour `HH:MM` for the existing data format. All class time and date calculations still work with previously saved schedules.
- **Automatic departure**: After a class exists, leave/get-ready times are calculated from class start, travel time, preparation time and buffer. For Walking or Driving, with permission and internet access, GPS triggers route lookup automatically (no need to press Apply Estimate), then updates the commute planner. Route times are routing estimates, **not live traffic**. If GPS or routing is unavailable, an editable fallback is used.
- **Previous v6 features retained**: Interactive Leaflet map, live GPS marker, school campus pins, walking/driving routes, transit-mode selector, cloud schedule and private researcher activity logs.
- **Old bugs fixed**: The `classForm` definition missing from v6 is restored, allowing Add Class to work.

## Quick UI preview (does not need Supabase)

Open `demo.html` via a local web server (e.g., `python -m http.server 8000`, browse to `http://localhost:8000/demo.html`) or on GitHub Pages. It uses simulated account and schedule data **in memory only**. It is not a separate database and **does not save changes**. `index.html` remains the actual cloud version.

## Deploy to GitHub Pages

1. Unzip the files and upload `index.html`, `app.js`, `styles.css`, `cloud-config.js`, `cloud-store.js`, `schema.sql`, etc. to your GitHub Pages publishing folder. For a public demo you can additionally upload `demo.html` and `demo-cloud.js`, but **do not point users to the demo for research data collection**.
2. In `cloud-config.js`, set the Supabase project URL and publishable/anon key. **Never use a secret/service-role key in frontend code**.
3. If this is a new database, run `schema.sql` in Supabase SQL Editor once. If v6 is already working, do **not** drop or recreate tables; v7 uses the same schema.
4. Enable Email sign-in and configure the GitHub Pages URL in Supabase Authentication redirect settings.
5. Open `index.html` over HTTPS, test signup/login, add a class at 9:00 PM then a second at 9:00 AM, change theme and save, reload, and confirm it persists.
6. On a smartphone, open **Commute Planner**, select Walking or Driving, start GPS, and allow location permission. Routes require a public third-party service and may not always respond. The map and GPS are not available offline.

## Privacy and limitations

- GPS requires the student's permission and only runs in the foreground. GPS coordinates are not stored in Supabase by this app; route coordinates are sent to third-party routing services if a route is requested.
- Public-transport routes for Jeepney / Train / Bus / UV are not available without a verified transit provider; they use the user's estimated journey minutes. No stops or live traffic times are invented.
- The public routing endpoint is best-effort, not suitable as a production SLA. It may rate-limit or fail; replace it with an appropriate routing service before a large rollout.
- On a non-Philippine-device timezone, next-class weekday calculation in this MVP uses the device timezone; the header clock always uses Asia/Manila. Test on Philippine devices for campus use.
- `schema.sql` logs only named study events (class added/deleted, commute/settings saved, GPS checked, map opened). Researcher reporting remains in Supabase.
- GitHub Pages can't host a server-side database; the main app continues to require Supabase cloud setup.

## Branding restored (v7.1)

- The original logo is now shown in the sign-in panel and sidebar.
- Upload **tamaraw-logo.png**, **favicon.ico**, **favicon.png**, **apple-touch-icon.png**, and the **icon-192.png** / **icon-512.png** install icons alongside the web app files.
- The logo/favicons use relative URLs, suitable for a GitHub Pages repository subpath.
- If the old tab icon persists, hard refresh (Ctrl+Shift+R) or open a private window.
- For Flutter, add the PNG under assets/images and list it in pubspec.yaml; Flutter launcher icons require separate platform icon generation.


## v9 journey planning
See `COMMUTE_PLANNER_V9.md` for direct mapped jeepney journeys plus walking directions and operational limitations.

## Web app feature update (v10)

- Kept the web app's existing first-time visual tutorial and its completion/replay behavior.
- Added monthly class calendar, multi-weekday recurring classes, class editing, and overlap warnings. Existing cloud records with a single `day` field remain supported.
- Added general, per-campus, and class-specific manual travel estimates with fresh route estimates taking temporary priority.
- Added a separate on-device planner in browser storage, independent of Supabase and research activity logging.
- Added browser session choice (Remember me), password recovery, and password changes using Supabase Auth.
- Improved GPS feedback, background tracking shutdown, route cancellation on destination changes, and route estimate refresh/expiry. Manual commute values remain available when routing is unavailable.
- Added commute origins from live GPS, FEU campuses, map-picked points, or entered coordinates.
- Added reviewed rail routing with actual pedestrian station access and reviewed interchanges, the supported LRT-2 stored-value fare matrix, a searchable 51-station reference, and a separate historical Sakay directory.
- Preserved conservative fare/ETA handling: unsupported fares stay unavailable, rail topology is not presented as a timetable, and the historical Sakay archive never produces current directions.

See `TRANSIT_PLANNER.md` for transit sources and limits. Deploy the complete `assets/transit/` folder with the web files. Run the checks in `TRANSIT_PLANNER.md` plus `node test-origin.js` before release. The cloud schedule payload and database schema are unchanged; `weekdays` is an optional addition that older single-day records do not need.

## Device alarms and Home Screen installation

- The dashboard and Settings include device-only leave-time alerts. Grant browser notification permission to receive a pop-up at the recommended departure time.
- Alarm preferences stay in the current browser/device. The app must remain open for its page timer to trigger an alarm; a closed browser/app is not covered by a server push service.
- On iPhone/iPad, use Safari's Share menu and choose **Add to Home Screen**. Notifications require opening the installed web app on iOS/iPadOS 16.4 or later.
- On Android, use Chrome's **Install app** or **Add to Home screen** menu. The app shows the platform instructions the first time on a phone and keeps a manual guide in the dashboard and Settings.

Run `node test-notifications.js` to check alarm timing and install/notification setup contracts.
