# Tamaraw Time web app build report

**Build status:** Complete  
**Build date:** 14 November 2026  
**Delivery:** Pushed to `origin/main` in commit `a727b6f` (`Upgrade web app commute and schedule planning`).

## Work completed

- Preserved the existing web app's first-time tutorial. A contract check confirms its original tutorial content and steps still match the repository version before this update.
- Expanded class scheduling with a monthly calendar, recurring multi-weekday classes, editing and deletion, Manila-time date handling, and overlap warnings. Older records that use one weekday remain supported.
- Improved commute planning with GPS, FEU campus, map-picked, or typed-coordinate origins; walking and driving route estimates; jeepney route lookup; and rail journeys through the reviewed connected network with pedestrian access paths and reviewed interchange walks.
- Added class and campus travel-time defaults, route estimate freshness and cancellation handling, and manual travel-time fallbacks where route data is unavailable.
- Improved GPS permission/error feedback and stops tracking when the user leaves the planner, backgrounds the page, or stops tracking. Coordinates are used in memory for route requests and are not saved with planner data.
- Added Remember me session handling, password recovery and password changes for configured Supabase accounts, plus a separate browser-local device planner.
- Added searchable station references and the historical Sakay archive as reference material only. Added the supplied transit datasets and their licensing/provenance files.
- Updated the preview, app documentation, and transit behavior documentation.

## Verification

All checks below passed on the final implementation before commit:

| Check | Result |
| --- | --- |
| `node --check app.js` | Passed |
| `node --check cloud-store.js` | Passed |
| `node --check transit-planner.js` | Passed |
| `node test-logic.js` | Passed |
| `node test-jeepney.js` | Passed |
| `node test-journey-v9.js` | Passed |
| `node test-schedule.js` | Passed |
| `node test-transit-planner.js` | Passed |
| `node test-web-contracts.js` | Passed |
| `node test-origin.js` | Passed |
| `node test-cloud-store.js` | Passed |
| `git diff --check` | Passed |

## Operational limits

- The provided rail data describes reviewed network topology, not live train positions, schedules, disruptions, or complete rail journey duration. The app therefore does not invent a rail ETA.
- Only the reviewed LRT-2 stored-value fare matrix is available. Unsupported rail fares remain unavailable; this matrix is not represented as a single-journey fare.
- Walking and driving ETAs come from public OpenStreetMap routing and do not include live traffic. Jeepney routes are based on mapped relations and do not establish whether a vehicle is operating, its wait time, or its fare.
- The Sakay archive ends in June 2020 and is never used for current journey or arrival recommendations.
- Live GPS permissions, external routing services, Supabase recovery emails/password changes, and physical-device behavior were not exercised against production services during this build. Online account features require the existing Supabase configuration and schema.

## Repository delivery

Implementation and transit data are committed and pushed to `origin/main` at `a727b6f`. This report is included as a follow-up repository commit.
