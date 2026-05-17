import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from 'expo-router'
import { ArrowsClockwiseIcon, InfoIcon, WarningCircleIcon } from 'phosphor-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  getRefloatConfigSnapshot,
  type RefloatConfigField,
  type RefloatConfigSnapshot,
} from 'vesc-ble'

import { InfoModal } from '@/components/InfoModal'

type LoadState =
  | { phase: 'loading'; snapshot: RefloatConfigSnapshot | null; error: string | null }
  | { phase: 'ready'; snapshot: RefloatConfigSnapshot; error: null }
  | { phase: 'error'; snapshot: RefloatConfigSnapshot | null; error: string }

type InfoModalState = {
  title: string
  message: string
} | null

const FIELD_INFO: Record<string, string> = {
  kp: 'Main proportional angle response. Higher values make the board respond more strongly to nose angle error.',
  kp2: 'Responds to angular velocity. This acts like damping and is especially noticeable during fast or aggressive nose-angle changes.',
  kp_brake: 'Multiplier for angle response while braking.',
  kp2_brake: 'Multiplier for rate response while braking.',
  ki: 'Integral angle correction. This helps remove sustained angle error over time.',
  ki_limit: 'Limits how much authority the integral correction can build up.',
  mahony_kp:
    'Pitch-axis Mahony filter accelerometer correction. Higher values feel looser and linger more; lower values feel snappier.',
  mahony_kp_roll:
    'Roll-axis Mahony filter correction. Lower roll correction can help the nose hold up in turns and make tight carves feel stiffer.',
  atr_strength_up:
    'Nose lift applied from adaptive torque response during uphill or acceleration load.',
  atr_strength_down:
    'Nose lowering applied from adaptive torque response during downhill or braking load.',
  atr_threshold_up: 'Angle threshold before uphill ATR behavior starts.',
  atr_threshold_down: 'Angle threshold before downhill ATR behavior starts.',
  atr_speed_boost: 'Boosts ATR response as speed increases.',
  atr_angle_limit: 'Maximum angle ATR tiltback is allowed to apply.',
  atr_on_speed: 'Maximum speed where ATR tiltback can be applied.',
  atr_off_speed: 'Maximum speed where ATR tiltback can be released.',
  atr_response_boost: 'Boost factor for tiltback response.',
  atr_transition_boost: 'Boost factor around ATR response transitions.',
  atr_filter: 'Current filter frequency used by ATR.',
  atr_amps_accel_ratio: 'Ratio used by acceleration-side ATR behavior.',
  atr_amps_decel_ratio: 'Ratio used by deceleration-side ATR behavior.',
  torquetilt_strength:
    'Nose lift based on positive output current. The basic Nose stiffness control writes this value.',
  torquetilt_strength_regen:
    'Nose lowering based on negative regen current. The basic Tail stiffness control writes this value.',
  torquetilt_start_current: 'Current threshold before torque tiltback starts.',
  torquetilt_angle_limit: 'Maximum angle torque tiltback is allowed to apply.',
  torquetilt_on_speed: 'Maximum speed where torque tiltback can be applied.',
  torquetilt_off_speed: 'Maximum speed where torque tiltback can be released.',
  turntilt_strength: 'Turn tiltback strength. The basic Carve tilt control writes this directly.',
  turntilt_angle_limit: 'Maximum turn tiltback angle.',
  turntilt_start_angle: 'Turn aggregate threshold before turn tiltback response starts.',
  turntilt_start_erpm: 'ERPM threshold before turn tiltback response starts.',
  turntilt_speed: 'Maximum speed where turn tiltback can be applied.',
  turntilt_erpm_boost: 'Speed-based boost percentage for turn tiltback.',
  turntilt_erpm_boost_end: 'ERPM where turn tiltback speed boost reaches its maximum.',
  turntilt_yaw_aggregate: 'Target accumulated yaw or turn value for turn tiltback.',
  braketilt_strength: 'Brake tilt strength. The basic Brake tilt control writes this directly.',
  braketilt_lingering: 'Controls how brake tilt lingers or releases after braking.',
  tiltback_constant: 'Constant nose angle offset.',
  tiltback_variable: 'Variable tiltback amount per ERPM.',
  tiltback_variable_max: 'Maximum variable tiltback target.',
}

function formatValue(value: number | boolean | string): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'string') return value
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
  return Number.isInteger(value)
    ? value.toFixed(0)
    : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to read Refloat config.'
}

export default function TuneScreen() {
  const navigation = useNavigation()
  const [state, setState] = useState<LoadState>({
    phase: 'loading',
    snapshot: null,
    error: null,
  })
  const [infoModal, setInfoModal] = useState<InfoModalState>(null)

  const load = useCallback(async () => {
    setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const snapshot = await getRefloatConfigSnapshot()
      setState({ phase: 'ready', snapshot, error: null })
    } catch (error) {
      setState((current) => ({
        phase: 'error',
        snapshot: current.snapshot,
        error: errorMessage(error),
      }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          style={[styles.headerButton, state.phase === 'loading' && styles.headerButtonDisabled]}
          onPress={() => void load()}
          disabled={state.phase === 'loading'}
        >
          {state.phase === 'loading' ? (
            <ActivityIndicator size="small" color="#38bdf8" />
          ) : (
            <ArrowsClockwiseIcon size={17} color="#cbd5e1" weight="bold" />
          )}
        </Pressable>
      ),
    })
  }, [load, navigation, state.phase])

  const snapshot = state.snapshot

  const showBadgeInfo = (title: string, message: string) => {
    setInfoModal({ title, message })
  }

  const showFieldInfo = (field: RefloatConfigField) => {
    const limits =
      field.min != null || field.max != null
        ? `\n\nRange: ${field.min != null ? formatValue(field.min) : '-'} to ${
            field.max != null ? formatValue(field.max) : '-'
          }${field.unit ? ` ${field.unit}` : ''}`
        : ''
    const units = field.unit ? `\nUnit: ${field.unit}` : ''
    setInfoModal({
      title: field.label,
      message: `${FIELD_INFO[field.id] ?? 'Read-only field decoded from the board custom config schema.'}${units}${limits}\nField ID: ${field.id}`,
    })
  }

  const closeInfo = () => setInfoModal(null)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {state.phase === 'loading' && !snapshot ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.stateText}>Reading board config...</Text>
        </View>
      ) : null}

      {state.phase === 'error' && !snapshot ? (
        <View style={styles.centerState}>
          <WarningCircleIcon size={28} color="#f87171" />
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {snapshot ? (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          {state.phase === 'error' ? (
            <View style={styles.errorBanner}>
              <WarningCircleIcon size={16} color="#fca5a5" />
              <Text style={styles.errorBannerText}>{state.error}</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            {snapshot.fwVersion ? (
              <InfoBadge
                label={snapshot.fwVersion}
                onPress={() =>
                  showBadgeInfo(
                    'Firmware',
                    'Firmware reported by the connected controller. This is useful diagnostic context, but the config decoder uses the board XML schema as the source of truth.',
                  )
                }
              />
            ) : null}
            <InfoBadge
              label={`CAN ${snapshot.canId}`}
              onPress={() =>
                showBadgeInfo(
                  'CAN ID',
                  `Controller CAN ID ${snapshot.canId}. Refloat config commands are forwarded to this controller before reading the schema and binary config.`,
                )
              }
            />
            <InfoBadge
              label={`${snapshot.rawConfigLength} bytes`}
              onPress={() =>
                showBadgeInfo(
                  'Config Size',
                  `${snapshot.rawConfigLength} bytes is the size of the raw Refloat custom config payload read from the controller. The app decodes only known tune fields from that binary struct.`,
                )
              }
            />
            {snapshot.missingFieldIds.length > 0 ? (
              <InfoBadge
                label={`${snapshot.missingFieldIds.length} missing`}
                danger
                onPress={() =>
                  showBadgeInfo(
                    'Missing Fields',
                    `These allowlisted fields were not present in the board schema: ${snapshot.missingFieldIds.join(
                      ', ',
                    )}`,
                  )
                }
              />
            ) : null}
          </View>

          {snapshot.groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupCount}>{group.fields.length} read-only values</Text>
              </View>
              <View style={styles.grid}>
                {group.fields.map((field) => (
                  <ConfigCell key={field.id} field={field} onInfo={() => showFieldInfo(field)} />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <InfoModal
        visible={infoModal != null}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onDismiss={closeInfo}
      />
    </SafeAreaView>
  )
}

function InfoBadge({
  label,
  danger = false,
  onPress,
}: {
  label: string
  danger?: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={[styles.metaBadge, danger && styles.metaBadgeDanger]} onPress={onPress}>
      <Text style={[styles.metaText, danger && styles.metaTextDanger]} selectable>
        {label}
      </Text>
      <InfoIcon size={12} color={danger ? '#fecaca' : '#64748b'} weight="bold" />
    </Pressable>
  )
}

function ConfigCell({ field, onInfo }: { field: RefloatConfigField; onInfo: () => void }) {
  return (
    <View style={styles.cell}>
      <Pressable style={styles.cellInfoButton} onPress={onInfo}>
        <InfoIcon size={13} color="#64748b" weight="bold" />
      </Pressable>
      <Text style={styles.cellValue} numberOfLines={1} adjustsFontSizeToFit selectable>
        {formatValue(field.value)}
      </Text>
      {field.unit ? (
        <Text style={styles.cellUnit} numberOfLines={1} selectable>
          {field.unit}
        </Text>
      ) : null}
      <Text style={styles.cellLabel} numberOfLines={2}>
        {field.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerButtonDisabled: {
    opacity: 0.7,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: {
    color: '#9ca3af',
    fontSize: 15,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#020617',
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#3f1111',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBannerText: {
    color: '#fecaca',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaBadge: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaBadgeDanger: {
    backgroundColor: '#7f1d1d',
    borderColor: '#991b1b',
  },
  metaText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  metaTextDanger: {
    color: '#fee2e2',
  },
  group: {
    gap: 6,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  groupTitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupCount: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '50%',
    minHeight: 78,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  cellInfoButton: {
    position: 'absolute',
    top: 9,
    right: 6,
    zIndex: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellValue: {
    color: '#f1f5f9',
    fontSize: 18,
    fontWeight: '700',
    paddingRight: 26,
    fontVariant: ['tabular-nums'],
  },
  cellUnit: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  cellLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
})
