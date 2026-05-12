import { useMemo } from 'react'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'

const cfg = telemetry.motorTemp

export default function MotorTempScreen() {
  const motorTemp = useLiveMetric(liveSelectors.motorTemp)
  const windowMs = useLiveWindowMs()

  const points = useMemo(() => toTelemetryChartPoints(motorTemp), [motorTemp])

  const range = useMemo(() => computeAutoRange(points, { baseline: cfg.chartRange }), [points])

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      <MetricDetailChart metric={cfg} points={points} range={range} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}
