import { useState, useEffect, useCallback } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  startRateTest,
  stopRateTest,
  addRateTestProgressListener,
  addRateTestResultListener,
  type RateTestStep,
  type RateTestResultEvent,
} from 'vesc-ble'
import { useBleStore } from '@/store/bleStore'
import { interaction, theme } from '@/constants/theme'

export default function RateTestScreen() {
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<RateTestStep[]>([])
  const [result, setResult] = useState<RateTestResultEvent | null>(null)
  const connected = useBleStore((s) => s.status === 'connected')

  useEffect(() => {
    const subProgress = addRateTestProgressListener((e) => {
      setSteps((prev) => [...prev, e])
    })
    const subResult = addRateTestResultListener((e) => {
      setResult(e)
      setRunning(false)
    })
    return () => {
      subProgress.remove()
      subResult.remove()
    }
  }, [])

  const handleStart = useCallback(async () => {
    setSteps([])
    setResult(null)
    setRunning(true)
    try {
      const res = await startRateTest()
      if (res.steps.length > 0) {
        setSteps(res.steps)
        setResult(res)
      }
    } catch {
      // result will come via event
    } finally {
      setRunning(false)
    }
  }, [])

  const handleStop = useCallback(() => {
    stopRateTest()
    setRunning(false)
  }, [])

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          android_ripple={interaction.ripple}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Poll Rate Test</Text>
        <View style={styles.spacer} />
      </View>

      {!connected && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>Board must be connected to run the test</Text>
        </View>
      )}

      <Pressable
        onPress={running ? handleStop : handleStart}
        disabled={!connected}
        android_ripple={interaction.ripple}
        style={[
          styles.btn,
          running ? styles.btnStop : styles.btnStart,
          !connected && styles.btnDisabled,
        ]}
      >
        <Text style={styles.btnText}>{running ? 'Stop Test' : 'Start Rate Test'}</Text>
      </Pressable>

      {running && (
        <View style={styles.running}>
          <ActivityIndicator color={theme.bran.color} />
          <Text style={styles.runningText}>Testing poll rates...</Text>
        </View>
      )}

      {steps.length > 0 && (
        <ScrollView style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.col, styles.colInterval]}>Interval</Text>
            <Text style={[styles.col, styles.colRate]}>Rate</Text>
            <Text style={[styles.col, styles.colSent]}>Sent</Text>
            <Text style={[styles.col, styles.colRecv]}>Recv</Text>
            <Text style={[styles.col, styles.colSuccess]}>Success</Text>
            <Text style={[styles.col, styles.colLatency]}>Latency</Text>
          </View>
          {steps.map((s, i) => (
            <View key={i} style={[styles.row, s.successRate >= 0.9 && styles.rowGood]}>
              <Text style={[styles.col, styles.colInterval, styles.mono]}>{s.intervalMs}ms</Text>
              <Text style={[styles.col, styles.colRate, styles.mono]}>
                {s.intervalMs > 0 ? (1000 / s.intervalMs).toFixed(0) : '-'}hz
              </Text>
              <Text style={[styles.col, styles.colSent, styles.mono]}>{s.pollsSent}</Text>
              <Text style={[styles.col, styles.colRecv, styles.mono]}>{s.responsesReceived}</Text>
              <Text
                style={[
                  styles.col,
                  styles.colSuccess,
                  styles.mono,
                  s.successRate >= 0.9
                    ? styles.good
                    : s.successRate >= 0.7
                      ? styles.warn
                      : styles.bad,
                ]}
              >
                {(s.successRate * 100).toFixed(0)}%
              </Text>
              <Text style={[styles.col, styles.colLatency, styles.mono]}>
                {s.avgLatencyMs != null ? `${s.avgLatencyMs.toFixed(0)}ms` : '-'}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {result && (
        <View style={styles.result}>
          <Text style={styles.resultLabel}>Recommended interval</Text>
          <Text style={styles.resultValue}>{result.recommendedIntervalMs}ms</Text>
          <Text style={styles.resultSub}>Max stable rate: {result.maxStableRate} Hz</Text>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: theme.neutral.surface,
  },
  backText: {
    color: theme.bran.text,
    fontSize: 14,
  },
  title: {
    flex: 1,
    color: theme.neutral.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  spacer: { width: 60 },
  warning: {
    backgroundColor: theme.warning.bg,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: theme.warning.color,
  },
  warningText: {
    color: theme.warning.text,
    fontSize: 14,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnStart: {
    backgroundColor: theme.bran.color,
  },
  btnStop: {
    backgroundColor: theme.error.color,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  running: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  runningText: {
    color: theme.bran.text,
    fontSize: 14,
  },
  table: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.neutral.border,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.neutral.borderMuted,
  },
  rowGood: {
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  col: {
    color: theme.neutral.textSecondary,
    fontSize: 13,
    textAlign: 'right',
  },
  colInterval: { width: 65, textAlign: 'left' },
  colRate: { width: 50 },
  colSent: { width: 45 },
  colRecv: { width: 45 },
  colSuccess: { width: 60 },
  colLatency: { width: 60 },
  mono: {
    color: theme.neutral.textPrimary,
    fontFamily: 'monospace',
  },
  good: { color: theme.gps.color },
  warn: { color: theme.warning.color },
  bad: { color: theme.error.color },
  result: {
    backgroundColor: theme.bran.bg,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.bran.border,
    alignItems: 'center',
  },
  resultLabel: {
    color: theme.bran.text,
    fontSize: 13,
    marginBottom: 4,
  },
  resultValue: {
    color: theme.bran.color,
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  resultSub: {
    color: theme.neutral.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
})
