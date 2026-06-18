---
status: accepted (supersedes the no-smoothing consequence of ADR-0011)
---

# Median-windowed SoC Estimate for display and alerts

ADR-0011 applied IR compensation to the SoC percentage but deliberately kept it instantaneous — "riders prefer responsive readings over artificially stable ones" — and rejected smoothing because it could hide real drops. In practice, residual sag transients that IR compensation does not fully cancel (peak-current spikes, current-measurement lag) still drop the percentage 5–10% below the true value for a few seconds, making the displayed % jump and firing battery alerts spuriously.

We now produce a single **Battery SoC Estimate**: the IR-compensated percentage passed through a **trailing median over a configurable window**. Both the display and battery Alert Rule evaluation read this Estimate, so they never diverge. Raw pack voltage remains the unmodified Telemetry Sample — only the percentage is smoothed.

The window is a global App Setting in **seconds** (default **20**, range **0–120**, step **5**, **0 = off / instantaneous**). The 120s hard cap is a safety bound: a low-battery alert that lags true charge by minutes could let the pack reach cutoff before warning. Median (not mean) rejects single-sample spikes harder and lags the real trend less.

## Considered Options

- **Smooth only the alert-evaluation input, leave display raw (preserves ADR-0011).** Rejected by the owner: a jumpy on-screen % is itself the complaint, and showing a raw % that disagrees with the value an alert fired on is confusing.
- **Mean instead of median.** Rejected: a mean is dragged by the very spikes we are rejecting; median ignores them.
- **Fixed 10-minute window.** Rejected: far longer than a sag transient (seconds), it would mask genuine discharge and delay safety alerts. The window targets transients, not sustained climb sag — that remains IR compensation's job.
- **Persist the computed % per sample for history.** Rejected: history recomputes the Estimate on read from stored voltage+current, mirroring how IR compensation is already applied on read. The read-path Estimate is approximate (stored samples are delta-encoded, so the window runs over sparser points than the live engine saw) — acceptable for debugging insight.

## Consequences

- Display % and battery alerts read the same Estimate; brief responsive dips are gone by design — the reverse of ADR-0011's stated preference.
- The window App Setting live-reloads into the running foreground service (mirroring battery-config reload); the window resets at the start of each Board Session.
- History battery % is recomputed per sample on read with the same median window; minute buckets keep raw aggregates and carry no Estimate.
- Raw voltage graphs and Telemetry Samples are unchanged (consistent with ADR-0008).
