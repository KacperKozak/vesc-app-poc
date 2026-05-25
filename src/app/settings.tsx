import { useCallback, useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet, ScrollView, Platform, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'
import {
  ClockCountdownIcon,
  BluetoothConnectedIcon,
  RecordIcon,
  GaugeIcon,
  CodeIcon,
  DatabaseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  TagIcon,
  AndroidLogoIcon,
  AppleLogoIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'
import {
  addTelemetryRebuildProgressListener,
  backupDatabase,
  getDatabaseSizeBytes,
  rebuildTelemetryBuckets,
  restoreDatabase,
} from 'vesc-ble'

import { routes } from '@/navigation/routes'
import { useSettingsStore } from '@/store/settingsStore'
import { useHistoryStore } from '@/store/historyStore'
import { theme } from '@/constants/theme'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'
import { Stepper } from '@/components/settings/Stepper'
import { Button } from '@/components/Button'
import { ConfirmModal } from '@/components/ConfirmModal'

const appVersion = Constants.expoConfig?.version ?? '–'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SettingsScreen() {
  const { liveHistoryLimit, autoConnect, autoRecording, movingSpeedThresholdKmh, set } =
    useSettingsStore(
      useShallow((s) => ({
        liveHistoryLimit: s.liveHistoryLimit,
        autoConnect: s.autoConnect,
        autoRecording: s.autoRecording,
        movingSpeedThresholdKmh: s.movingSpeedThresholdKmh,
        set: s.set,
      })),
    )
  const [dbSize, setDbSize] = useState<number | null>(null)
  const [rebuildState, setRebuildState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [rebuildResult, setRebuildResult] = useState<string | null>(null)
  const [backupState, setBackupState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [backupResult, setBackupResult] = useState<string | null>(null)
  const [restoreState, setRestoreState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [restoreResult, setRestoreResult] = useState<string | null>(null)
  const [restoreConfirmVisible, setRestoreConfirmVisible] = useState(false)
  const [rebuildProgress, setRebuildProgress] = useState<{ current: number; total: number } | null>(
    null,
  )

  const refreshDatabaseSize = useCallback(() => {
    getDatabaseSizeBytes()
      .then(setDbSize)
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshDatabaseSize()
  }, [refreshDatabaseSize])

  useEffect(() => {
    const subscription = addTelemetryRebuildProgressListener((event) => {
      setRebuildProgress(event)
    })
    return () => subscription.remove()
  }, [])

  const decrementLimit = useCallback(() => {
    if (liveHistoryLimit > 1) void set('liveHistoryLimit', liveHistoryLimit - 1)
  }, [liveHistoryLimit, set])

  const incrementLimit = useCallback(() => {
    if (liveHistoryLimit < 50) void set('liveHistoryLimit', liveHistoryLimit + 1)
  }, [liveHistoryLimit, set])

  const decrementMovingSpeedThreshold = useCallback(() => {
    if (movingSpeedThresholdKmh > 0) {
      void set('movingSpeedThresholdKmh', movingSpeedThresholdKmh - 1)
    }
  }, [movingSpeedThresholdKmh, set])

  const incrementMovingSpeedThreshold = useCallback(() => {
    if (movingSpeedThresholdKmh < 20) {
      void set('movingSpeedThresholdKmh', movingSpeedThresholdKmh + 1)
    }
  }, [movingSpeedThresholdKmh, set])

  const handleRebuildBuckets = useCallback(async () => {
    setRebuildState('running')
    setRebuildResult(null)
    setRebuildProgress(null)
    try {
      await rebuildTelemetryBuckets()
      setRebuildState('done')
      setRebuildResult(null)
      setRebuildProgress(null)
    } catch (e: any) {
      setRebuildState('error')
      setRebuildResult(e?.message ?? 'Unknown error')
      setRebuildProgress(null)
    }
  }, [])

  const handleBackupDatabase = useCallback(async () => {
    setBackupState('running')
    setBackupResult(null)
    try {
      const backup = await backupDatabase()
      await Sharing.shareAsync(backup.uri, {
        mimeType: 'application/zip',
        dialogTitle: 'Save or send database backup',
        UTI: 'com.pkware.zip-archive',
      })
      setBackupState('done')
      setBackupResult(`${backup.name} (${formatBytes(backup.sizeBytes)})`)
      refreshDatabaseSize()
    } catch (e: any) {
      setBackupState('error')
      setBackupResult(e?.message ?? 'Backup failed')
    }
  }, [refreshDatabaseSize])

  const handleRestoreDatabase = useCallback(async () => {
    setRestoreConfirmVisible(false)
    setRestoreState('running')
    setRestoreResult(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed'],
        copyToCacheDirectory: true,
      })
      if (result.canceled) {
        setRestoreState('idle')
        return
      }
      const uri = result.assets[0]?.uri
      if (!uri) throw new Error('No backup file selected')
      await restoreDatabase(uri)
      await Promise.all([
        useSettingsStore.getState().load(),
        useHistoryStore.getState().loadInitial(),
      ])
      setRestoreState('done')
      setRestoreResult('Database restored')
      refreshDatabaseSize()
    } catch (e: any) {
      setRestoreState('error')
      setRestoreResult(e?.message ?? 'Restore failed')
    }
  }, [refreshDatabaseSize])

  const rebuildHint =
    rebuildState === 'error' && rebuildResult
      ? rebuildResult
      : 'Refresh historical data with newest algorithms'
  const rebuildProgressValue =
    rebuildProgress && rebuildProgress.total > 0
      ? Math.min(1, rebuildProgress.current / rebuildProgress.total)
      : 0
  const rebuildProgressLabel = rebuildProgress
    ? `${rebuildProgress.current}/${rebuildProgress.total}`
    : null
  const backupHint =
    backupState === 'error' && backupResult
      ? backupResult
      : backupState === 'done' && backupResult
        ? backupResult
        : 'Create a shareable zip for debugging'
  const restoreHint =
    restoreState === 'error' && restoreResult
      ? restoreResult
      : restoreState === 'done' && restoreResult
        ? restoreResult
        : 'Replace current database from backup zip'

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>Vibe Wheel</Text>
          <View style={styles.headerStats}>
            <View style={styles.headerItem}>
              <TagIcon size={14} color={theme.wheel.color} weight="duotone" />
              <Text style={styles.headerValue}>v{appVersion}</Text>
            </View>
            <View style={styles.headerItem}>
              {Platform.OS === 'ios' ? (
                <AppleLogoIcon size={14} color={theme.target.color} weight="duotone" />
              ) : (
                <AndroidLogoIcon size={14} color={theme.gps.color} weight="duotone" />
              )}
              <Text style={styles.headerValue}>
                {Platform.OS === 'ios' ? 'iOS' : 'Android'} {Platform.Version}
              </Text>
            </View>
            <View style={styles.headerItem}>
              <DatabaseIcon size={14} color={theme.warning.color} weight="duotone" />
              <Text style={styles.headerValue}>{dbSize != null ? formatBytes(dbSize) : '–'}</Text>
            </View>
          </View>
        </View>

        <SettingsSectionTitle>General</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={ClockCountdownIcon}
            label="Live history limit"
            hint="Minutes of telemetry visible in live graphs"
            right={
              <Stepper
                value={liveHistoryLimit}
                onDecrement={decrementLimit}
                onIncrement={incrementLimit}
              />
            }
          />
          <SettingsRow
            icon={GaugeIcon}
            label="Moving speed threshold"
            hint="Speeds below this are ignored for avg speed. Only affects new rides."
            right={
              <Stepper
                value={`${movingSpeedThresholdKmh} km/h`}
                onDecrement={decrementMovingSpeedThreshold}
                onIncrement={incrementMovingSpeedThreshold}
              />
            }
          />
        </SettingsCard>

        <SettingsSectionTitle>Database</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={DownloadSimpleIcon}
            iconColor={theme.gps.color}
            label="Back up database"
            hint={backupHint}
            right={
              <Button
                label={backupState === 'running' ? 'Exporting...' : 'Export'}
                size="sm"
                variant="secondary"
                loading={backupState === 'running'}
                disabled={restoreState === 'running' || rebuildState === 'running'}
                onPress={handleBackupDatabase}
              />
            }
          />
          <SettingsRow
            icon={UploadSimpleIcon}
            iconColor={theme.warning.color}
            label="Restore database"
            hint={restoreHint}
            right={
              <Button
                label={restoreState === 'running' ? 'Restoring...' : 'Restore'}
                size="sm"
                variant="destructive"
                loading={restoreState === 'running'}
                disabled={backupState === 'running' || rebuildState === 'running'}
                onPress={() => setRestoreConfirmVisible(true)}
              />
            }
          />
          <SettingsRow
            icon={ClockCounterClockwiseIcon}
            label="Rebuild history"
            hint={rebuildHint}
            right={
              <Pressable
                style={[
                  styles.rebuildButton,
                  rebuildState === 'running' && styles.rebuildButtonDisabled,
                  rebuildState === 'done' && styles.rebuildButtonDone,
                ]}
                onPress={handleRebuildBuckets}
                disabled={rebuildState === 'running'}
              >
                {rebuildState === 'done' && (
                  <CheckCircleIcon size={13} color="#bbf7d0" weight="fill" />
                )}
                <Text style={styles.rebuildButtonText}>
                  {rebuildState === 'running'
                    ? 'Rebuilding...'
                    : rebuildState === 'done'
                      ? 'Done'
                      : 'Rebuild'}
                </Text>
              </Pressable>
            }
          >
            {rebuildState === 'running' && (
              <View style={styles.rebuildProgress}>
                <View style={styles.rebuildProgressTrack}>
                  <View
                    style={[
                      styles.rebuildProgressFill,
                      { width: `${Math.round(rebuildProgressValue * 100)}%` },
                    ]}
                  />
                </View>
                {rebuildProgressLabel ? (
                  <Text style={styles.rebuildProgressText}>{rebuildProgressLabel}</Text>
                ) : null}
              </View>
            )}
          </SettingsRow>
        </SettingsCard>

        <SettingsSectionTitle>Connection</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={BluetoothConnectedIcon}
            label="Auto connect"
            hint="Connect to board on app start"
            right={
              <Switch
                value={autoConnect}
                onValueChange={(v) => void set('autoConnect', v)}
                trackColor={{ false: '#334155', true: '#1d4ed8' }}
                thumbColor={autoConnect ? '#3b82f6' : '#64748b'}
              />
            }
          />
          <SettingsRow
            icon={RecordIcon}
            iconWeight="fill"
            label="Auto recording"
            hint="Start recording when board connects"
            right={
              <Switch
                value={autoRecording}
                onValueChange={(v) => void set('autoRecording', v)}
                trackColor={{ false: '#334155', true: '#1d4ed8' }}
                thumbColor={autoRecording ? '#3b82f6' : '#64748b'}
              />
            }
          />
        </SettingsCard>

        <SettingsSectionTitle>Developer</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={CodeIcon}
            label="Dev tools"
            hint="Diagnostics and local verification"
            onPress={() => router.push(routes.settingsDev)}
          />
        </SettingsCard>
      </ScrollView>
      <ConfirmModal
        visible={restoreConfirmVisible}
        title="Restore database"
        message="Current database will be replaced by selected backup. App keeps a temporary rollback copy during restore and restores old database if restore fails."
        confirmLabel="Choose backup"
        destructive
        onConfirm={() => void handleRestoreDatabase()}
        onCancel={() => setRestoreConfirmVisible(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    gap: 8,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  appName: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 20,
  },
  headerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerValue: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  rebuildButton: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rebuildButtonDisabled: {
    opacity: 0.5,
  },
  rebuildButtonDone: {
    borderColor: '#166534',
    backgroundColor: '#052e16',
  },
  rebuildButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  rebuildProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 12,
  },
  rebuildProgressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: '#0f172a',
    borderRadius: 999,
    overflow: 'hidden',
  },
  rebuildProgressFill: {
    height: '100%',
    backgroundColor: theme.warning.color,
  },
  rebuildProgressText: {
    minWidth: 44,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
})
