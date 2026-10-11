# Tamaraw Time — Web MVP

A standalone, responsive student time-management web app designed for FEU students. Uses the supplied green, yellow, orange, charcoal and cream palette.

## Run without Node.js

1. Extract `tamaraw-time-web.zip`.
2. Double-click `index.html` to open it in Chrome, Edge, Firefox, or Safari.
3. Add your own classes and tasks, and configure your commute assumptions.

No npm installation, build tooling, or internet connection is required for the basic functionality. Internet connectivity is required to open Google Maps.

## Features

- Home dashboard with the next class, pending tasks, and a departure recommendation.
- Weekly recurring class schedule: add/delete classes.
- Task and deadline tracker: add, complete and delete tasks.
- Smart departure time and wake-up time estimation using *user-entered* commute, preparation, and buffer minutes.
- One-click Google Maps navigation to selected FEU campus.
- Optional GPS check using the browser's Geolocation API (typically requires HTTPS or localhost).
- Local persistence via `localStorage` and JSON export.
- Responsive desktop/mobile interface, no backend required.

## Limitations

- **No live traffic ETA:** Maps opens externally but the departure estimate is calculated from the journey minutes you enter.
- **No real push alarms:** Regular browser tabs cannot guarantee alarm-clock notifications, especially while closed. Reminder notifications require a service worker, secure context and appropriate permissions; native-grade alarms would require a mobile-specific implementation.
- **No cloud sync or FEU portal integration.** Browser-stored data is device/browser-specific and can disappear if site data is cleared.
- **Geolocation may not work when opened as a local `file://` page.** Use an HTTPS host or local server for GPS access.
- Demo data is illustrative, not an official FEU timetable.

## Deployment (optional)

Upload `index.html`, `styles.css`, and `app.js` together to any static host (e.g., GitHub Pages, Netlify). No build step is necessary.

## Files

- `index.html` — App structure
- `styles.css` — Responsive visual design and color tokens
- `app.js` — UI, data persistence, calendar/task logic and commute calculator
