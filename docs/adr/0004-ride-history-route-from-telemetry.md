# Ride History routes come from Telemetry Samples

Ride History derives routes from GPS fixes attached to Telemetry Samples. Standalone phone GPS updates remain part of Live State only and do not create or extend Ride Recordings.

## Considered Options

- **Persist a separate history GPS stream.** Rejected because it creates two durable timelines for one Ride Recording. Map routes can extend beyond board telemetry, while graphs and seek controls remain telemetry-bound.
- **Filter standalone GPS at render time.** Rejected because durable truth would still contain GPS-only Ride History data and every caller would need to remember the same filtering rule.
- **Store GPS only with telemetry.** Chosen because Ride Recording is board-owned: GPS enriches Telemetry Samples, but does not define the recording by itself.

## Consequences

- Historical routes, graphs, summaries, and seek controls share the same telemetry-owned timeline.
- Existing GPS-only history rows are dropped by migration.
- Live map GPS behavior is unchanged; approximate and precise phone fixes can still update Live State without becoming Ride History.
- A GPS outage during a ride leaves telemetry samples without route points for that span instead of creating a separate route stream.
