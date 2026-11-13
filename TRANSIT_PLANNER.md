# Web transit planner

The web app now uses the reviewed railway graph supplied with the Flutter
application. **Commute Planner → Find route** checks nearby station entrances,
requests real pedestrian paths to and from those entrances, follows connected
directed rail segments, and includes only reviewed station-to-station walking
interchanges. Candidate search is bounded to nearby stations and up to three
results; it is not an exhaustive journey optimizer.

The map shows the returned pedestrian geometry and mapped rail geometry. Rail
geometry describes network topology, not a live train, timetable, operating
status, platform path, or service alert. The supplied graph has no complete
reviewed rail timing, so the app leaves the total train ETA unavailable and
continues to use the student's editable journey-time fallback for departure
planning. Driving and walking ETAs are separate OpenStreetMap routing estimates
without live traffic.

Choose the trip origin from live GPS, an FEU campus, a map point, or entered
latitude/longitude. GPS is required only for the live-location origin. Coordinates
are used for that route request and are not saved with the planner state.

The only included rail fare is the reviewed LRT-2 stored-value fare matrix. It
is labelled as a stored-value product and is not presented as a single-journey
ticket quote. Unsupported rail fares remain unavailable. Jeepney route
discovery continues to use mapped OSM route relations; the route data does not
verify current service, fares, waiting time, or vehicle location.

The **Stations & route references** section can browse the 51 reviewed station
records and the imported Sakay route archive. The Sakay archive is explicitly
historical reference data ending in June 2020. It is not used to produce current
journeys, fares, or arrival predictions.

## Data and refresh policy

Bundled files live in `assets/transit/`. OpenStreetMap attribution and ODbL
licensing details are in `assets/transit/OSM_DATA_LICENSE.md`; the Sakay data
license is in `assets/transit/sakay_gtfs_LICENSE.md`. The railway topology
review window is 9 November–9 December 2026 (Manila). The fare and station
references carry their own expiry dates. Expired records are not used for route
or fare recommendations. Review source records before extending dates.

Pedestrian routing requests send the student's current GPS coordinates to the
public OSM routing service. Coordinates are held in memory and are not added to
the Supabase schedule payload or study activity log. See `JEEPNEY_MODE.md` for
the existing jeepney provider limits.

## Checks

```powershell
node --check app.js
node --check cloud-store.js
node --check transit-planner.js
node test-logic.js
node test-jeepney.js
node test-journey-v9.js
node test-schedule.js
node test-transit-planner.js
node test-web-contracts.js
node test-origin.js
node test-cloud-store.js
```
