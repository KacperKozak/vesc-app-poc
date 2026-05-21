import { useNavigation } from 'expo-router'
import { PlusIcon, TrashIcon, WaveformIcon, RadioIcon } from 'phosphor-react-native'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

import { theme } from '@/constants/theme'
import { type AlertSoundType, useAlertsStore } from '@/store/alertsStore'
import {
  type AlertPreset,
  type AlertPresetCategory,
  getAlertPresets,
  previewAlertSound,
} from 'vesc-ble'

type AlertTab = 'single' | 'geiger'

function getPresetsForCategory(category: AlertPresetCategory): AlertPreset[] {
  return getAlertPresets().filter((p) => p.category === category)
}

interface Props {
  title: string
  children: ReactNode
  controlId?: string
  unit?: string
  alertControls?: AlertControl[]
}

interface AlertControl {
  label: string
  controlId: string
  unit: string
}

interface AddModalProps {
  visible: boolean
  unit: string
  onClose(): void
  onAdd(threshold: number, thresholdMax: number | null, soundType: AlertSoundType): void
}

function SoundPicker({
  presets,
  selected,
  onSelect,
}: {
  presets: AlertPreset[]
  selected: string
  onSelect: (uri: string) => void
}) {
  return (
    <View style={styles.modalField}>
      <Text style={styles.fieldLabel}>SOUND</Text>
      <View style={styles.soundRow}>
        {presets.map((preset) => {
          const active = selected === preset.uri
          return (
            <TouchableOpacity
              key={preset.uri}
              style={[styles.soundOption, active && styles.soundOptionActive]}
              onPress={() => {
                onSelect(preset.uri)
                previewAlertSound(preset.uri)
              }}
            >
              <Text style={[styles.soundOptionText, active && styles.soundOptionTextActive]}>
                {preset.name}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function AddAlertModal({ visible, unit, onClose, onAdd }: AddModalProps) {
  const [tab, setTab] = useState<AlertTab>('single')
  const [thresholdText, setThresholdText] = useState('')
  const [maxText, setMaxText] = useState('')
  const singlePresets = useMemo(() => getPresetsForCategory('single'), [])
  const geigerPresets = useMemo(() => getPresetsForCategory('geiger'), [])
  const [soundType, setSoundType] = useState<AlertSoundType>(singlePresets[0]?.uri ?? 'preset:beep')

  function handleTabSwitch(next: AlertTab) {
    setTab(next)
    const presets = next === 'single' ? singlePresets : geigerPresets
    setSoundType(presets[0]?.uri ?? 'preset:beep')
  }

  function handleAdd() {
    const threshold = Number.parseFloat(thresholdText)
    if (!Number.isFinite(threshold)) return
    if (tab === 'geiger') {
      const parsedMax = Number.parseFloat(maxText)
      if (!Number.isFinite(parsedMax)) return
      onAdd(threshold, parsedMax, soundType)
    } else {
      onAdd(threshold, null, soundType)
    }
    setThresholdText('')
    setMaxText('')
  }

  function handleClose() {
    setThresholdText('')
    setMaxText('')
    setTab('single')
    setSoundType(singlePresets[0]?.uri ?? 'preset:beep')
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
          accessible={false}
        />
        <View style={styles.modal}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            contentContainerStyle={styles.modalContent}
          >
            <Text style={styles.modalTitle}>Add Alert</Text>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, tab === 'single' && styles.tabActive]}
                onPress={() => handleTabSwitch('single')}
              >
                <Text style={[styles.tabText, tab === 'single' && styles.tabTextActive]}>
                  Single
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'geiger' && styles.tabActive]}
                onPress={() => handleTabSwitch('geiger')}
              >
                <Text style={[styles.tabText, tab === 'geiger' && styles.tabTextActive]}>
                  Geiger
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.fieldLabel}>THRESHOLD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={thresholdText}
                  onChangeText={setThresholdText}
                  placeholder="0"
                  placeholderTextColor="#475569"
                  autoFocus
                  returnKeyType={tab === 'geiger' ? 'next' : 'done'}
                  onSubmitEditing={tab === 'single' ? handleAdd : undefined}
                />
                {unit ? <Text style={styles.unitLabel}>{unit}</Text> : null}
              </View>
            </View>

            {tab === 'geiger' && (
              <View style={styles.modalField}>
                <Text style={styles.fieldLabel}>THRESHOLD MAX</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={maxText}
                    onChangeText={setMaxText}
                    placeholder="0"
                    placeholderTextColor="#475569"
                    returnKeyType="done"
                    onSubmitEditing={handleAdd}
                  />
                  {unit ? <Text style={styles.unitLabel}>{unit}</Text> : null}
                </View>
              </View>
            )}

            <SoundPicker
              presets={tab === 'single' ? singlePresets : geigerPresets}
              selected={soundType}
              onSelect={setSoundType}
            />

            <TouchableOpacity style={styles.confirmButton} onPress={handleAdd}>
              <Text style={styles.confirmText}>Add</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

interface AlertsSectionProps {
  controlId: string
  unit: string
}

function AlertsSection({ controlId, unit }: AlertsSectionProps) {
  const allRules = useAlertsStore((s) => s.rules)
  const rules = useMemo(
    () => allRules.filter((rule) => rule.controlId === controlId),
    [allRules, controlId],
  )
  const add = useAlertsStore((s) => s.add)
  const toggle = useAlertsStore((s) => s.toggle)
  const remove = useAlertsStore((s) => s.remove)
  const [modalVisible, setModalVisible] = useState(false)

  if (controlId === 'state') {
    return <Text style={styles.stateNote}>Fault alerts are always active.</Text>
  }

  return (
    <>
      {rules.map((rule) => (
        <View key={rule.id} style={styles.rule}>
          <TouchableOpacity
            style={styles.ruleLeft}
            onPress={() => void toggle(rule.id)}
            hitSlop={8}
          >
            <View style={[styles.dot, rule.enabled && styles.dotActive]} />
            {rule.thresholdMax != null ? (
              <RadioIcon size={12} color="#64748b" weight="fill" />
            ) : (
              <WaveformIcon size={12} color="#64748b" weight="fill" />
            )}
            <Text style={[styles.ruleText, !rule.enabled && styles.ruleTextDisabled]}>
              {rule.thresholdMax != null
                ? `${rule.threshold} - ${rule.thresholdMax}${unit ? ` ${unit}` : ''}`
                : `${rule.threshold}${unit ? ` ${unit}` : ''}`}
            </Text>
            <Text style={styles.ruleMeta}>{rule.thresholdMax != null ? 'geiger' : 'single'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void remove(rule.id)} hitSlop={8}>
            <TrashIcon size={16} color={theme.error.color} weight="fill" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
        <PlusIcon size={14} color={theme.wheel.color} weight="fill" />
        <Text style={styles.addButtonText}>Add Rule</Text>
      </TouchableOpacity>
      <AddAlertModal
        visible={modalVisible}
        unit={unit}
        onClose={() => setModalVisible(false)}
        onAdd={(threshold, thresholdMax, soundType) => {
          add(controlId, threshold, thresholdMax, soundType)
          setModalVisible(false)
        }}
      />
    </>
  )
}

export function ControlDetailLayout({
  title,
  children,
  controlId,
  unit = '',
  alertControls,
}: Props) {
  const navigation = useNavigation()
  useEffect(() => {
    navigation.setOptions({ title })
  }, [title, navigation])

  const controls = alertControls ?? (controlId ? [{ label: title, controlId, unit }] : [])

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {children}
      <View style={styles.alertsSection}>
        <View style={styles.alertsHeader}>
          <Text style={styles.sectionLabel}>ALERTS</Text>
        </View>
        {controls.length > 0 ? (
          controls.map((control, index) => (
            <View key={control.controlId} style={styles.alertControl}>
              {controls.length > 1 ? (
                <Text style={[styles.alertControlLabel, index > 0 && styles.alertControlLabelGap]}>
                  {control.label.toUpperCase()}
                </Text>
              ) : null}
              <AlertsSection controlId={control.controlId} unit={control.unit} />
            </View>
          ))
        ) : (
          <Text style={styles.placeholder}>No alert configuration available.</Text>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  alertsSection: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    gap: 10,
  },
  alertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertControl: {
    gap: 8,
  },
  alertControlLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  alertControlLabelGap: {
    marginTop: 8,
  },
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  placeholder: {
    color: '#475569',
    fontSize: 14,
  },
  stateNote: {
    color: '#475569',
    fontSize: 14,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  ruleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
  },
  dotActive: {
    backgroundColor: theme.wheel.color,
    borderColor: theme.wheel.color,
  },
  ruleText: {
    color: '#f1f5f9',
    fontSize: 14,
  },
  ruleTextDisabled: {
    color: '#475569',
  },
  ruleMeta: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  addButtonText: {
    color: theme.wheel.color,
    fontSize: 14,
    fontWeight: '500',
  },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    width: '100%',
    maxWidth: 320,
    maxHeight: '90%',
  },
  modalContent: {
    padding: 20,
    gap: 14,
  },
  modalTitle: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '600',
  },
  modalField: {
    gap: 6,
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '600',
  },
  soundRow: {
    flexDirection: 'row',
    gap: 8,
  },
  soundOption: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    paddingVertical: 10,
  },
  soundOptionActive: {
    borderColor: theme.wheel.color,
    backgroundColor: '#123044',
  },
  soundOptionText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  soundOptionTextActive: {
    color: '#f1f5f9',
  },
  unitLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  confirmButton: {
    backgroundColor: theme.wheel.color,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: {
    color: '#0c2a3f',
    fontSize: 15,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 0,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#0f172a',
  },
  tabActive: {
    backgroundColor: theme.wheel.bg,
  },
  tabText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#f1f5f9',
  },
})
