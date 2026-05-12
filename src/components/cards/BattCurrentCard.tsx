import { TelemetryCard } from '@/components/TelemetryCard'
import { telemetry } from '@/constants/telemetry'
import { DASH } from '@/helpers/format'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const cfg = telemetry.battCurrent
const FMT_MAX = (v: number) => cfg.formatWithUnit(v)

export function BattCurrentCard() {
  const series = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()

  return (
    <TelemetryCard
      controlId={cfg.controlId}
      label={cfg.label}
      value={DASH}
      unit={cfg.unit}
      animatedValue={liveTelemetryRuntime.values.batteryCurrent}
      animatedDecimals={cfg.decimals}
      series={series}
      seriesColor={cfg.color}
      fmtMax={FMT_MAX}
      minSpan={cfg.minSpan}
      windowMs={windowMs}
    />
  )
}
