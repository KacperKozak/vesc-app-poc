import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CheckCircleIcon, CircleIcon } from 'phosphor-react-native'
import type { BoardCandidate } from 'vesc-ble'

import { formatBoardTransport } from '@/lib/boardTransport'
import { theme } from '@/constants/theme'

interface Props {
  candidates: BoardCandidate[]
  selected: BoardCandidate | null
  onSelect: (candidate: BoardCandidate) => void
  testIDPrefix: string
}

/** Selectable list of probe-confirmed Board Transports, first valid preselected. */
export function BoardProbeCandidates({ candidates, selected, onSelect, testIDPrefix }: Props) {
  return (
    <View style={styles.list}>
      {candidates.map((candidate) => {
        const isSelected = candidate.transport === selected?.transport
        return (
          <Pressable
            key={String(candidate.transport)}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => onSelect(candidate)}
            testID={`${testIDPrefix}-${candidate.transport}`}
          >
            {isSelected ? (
              <CheckCircleIcon size={22} color={theme.wheel.color} weight="fill" />
            ) : (
              <CircleIcon size={22} color={theme.neutral.textMuted} weight="regular" />
            )}
            <Text style={styles.optionLabel}>{formatBoardTransport(candidate.transport)}</Text>
            {candidate.hasBms ? <Text style={styles.badge}>BMS</Text> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surface,
  },
  optionSelected: {
    borderColor: theme.wheel.color,
  },
  optionLabel: {
    flex: 1,
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    color: theme.wheel.color,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    borderWidth: 1,
    borderColor: theme.wheel.color,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
})
