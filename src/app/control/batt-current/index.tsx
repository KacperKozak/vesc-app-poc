import { useMemo } from 'react'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.battCurrent

export default function BattCurrentScreen() {
  const batteryCurrent = useLiveMetric(liveSelectors.batteryCurrent)
  const windowMs = useLiveWindowMs()

  const points = useMemo(() => toTelemetryChartPoints(batteryCurrent), [batteryCurrent])

  const range = useMemo(() => computeAutoRange(points, { baseline: cfg.chartRange }), [points])

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <MetricDetailChart metric={cfg} points={points} range={range} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}
