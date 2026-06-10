import { useEventListener } from 'expo'
import { Image } from 'expo-image'
import { VideoView, useVideoPlayer } from 'expo-video'
import { CaretLeftIcon, CaretRightIcon, XIcon } from 'phosphor-react-native'
import { useMemo, useState } from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { HistoryMarker, TelemetrySample } from 'vesc-ble'

import { IconButton } from '@/components/ui/base/IconButton'
import { telemetry } from '@/constants/telemetry'
import { dutyPercent } from '@/helpers/format'
import { findVideoTelemetrySample, type MediaHistoryAsset } from '@/lib/history/mediaHistory'
import { theme } from '@/constants/theme'

function VideoAsset({
  asset,
  samples,
  markers,
}: {
  asset: MediaHistoryAsset
  samples: TelemetrySample[]
  markers: HistoryMarker[]
}) {
  const [playbackSeconds, setPlaybackSeconds] = useState(0)
  const [unavailable, setUnavailable] = useState(false)
  const player = useVideoPlayer(asset.uri, (instance) => {
    instance.timeUpdateEventInterval = 0.25
    instance.play()
  })
  useEventListener(player, 'timeUpdate', ({ currentTime }) => setPlaybackSeconds(currentTime))
  useEventListener(player, 'statusChange', ({ status }) => setUnavailable(status === 'error'))
  const sample = useMemo(
    () => findVideoTelemetrySample(samples, markers, asset.creationTime, playbackSeconds),
    [asset.creationTime, markers, playbackSeconds, samples],
  )
  return (
    <>
      <VideoView player={player} nativeControls contentFit="contain" style={styles.media} />
      {unavailable ? <Text style={styles.mediaUnavailable}>Video unavailable</Text> : null}
      <View style={styles.telemetryRow}>
        {sample ? (
          <>
            <Text style={styles.telemetryValue}>
              {telemetry.speed.formatWithUnit(sample.speedKmh)}
            </Text>
            <Text style={styles.telemetryValue}>
              {telemetry.duty.formatWithUnit(dutyPercent(sample.dutyCycle, false))}
            </Text>
            <Text style={styles.telemetryValue}>
              {telemetry.battVoltage.formatWithUnit(sample.batteryVoltage)}
            </Text>
          </>
        ) : (
          <Text style={styles.unavailable}>Ride telemetry unavailable</Text>
        )}
      </View>
    </>
  )
}

function PhotoAsset({ asset }: { asset: MediaHistoryAsset }) {
  const [unavailable, setUnavailable] = useState(false)
  return (
    <>
      <Image
        source={asset.uri}
        contentFit="contain"
        style={styles.media}
        onError={() => setUnavailable(true)}
      />
      {unavailable ? <Text style={styles.mediaUnavailable}>Photo unavailable</Text> : null}
    </>
  )
}

export function MediaHistoryViewer({
  assets,
  samples,
  markers,
  onClose,
}: {
  assets: MediaHistoryAsset[]
  samples: TelemetrySample[]
  markers: HistoryMarker[]
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [index, setIndex] = useState(0)
  const asset = assets[Math.min(index, assets.length - 1)]

  if (!asset) return null

  return (
    <Modal visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        {asset.mediaType === 'video' ? (
          <VideoAsset key={asset.id} asset={asset} samples={samples} markers={markers} />
        ) : (
          <PhotoAsset key={asset.id} asset={asset} />
        )}
        <IconButton
          icon={XIcon}
          onPress={onClose}
          style={[styles.close, { top: Math.max(insets.top, 10) }]}
        />
        {assets.length > 1 ? (
          <>
            <IconButton
              icon={CaretLeftIcon}
              onPress={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={index === 0}
              style={styles.previous}
            />
            <IconButton
              icon={CaretRightIcon}
              onPress={() => setIndex((current) => Math.min(assets.length - 1, current + 1))}
              disabled={index === assets.length - 1}
              style={styles.next}
            />
            <Text style={[styles.position, { bottom: Math.max(insets.bottom, 12) }]}>
              {index + 1} / {assets.length}
            </Text>
          </>
        ) : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surfaceDeep,
  },
  media: {
    ...StyleSheet.absoluteFill,
  },
  close: {
    position: 'absolute',
    right: 10,
  },
  previous: {
    position: 'absolute',
    left: 10,
    top: '50%',
  },
  next: {
    position: 'absolute',
    right: 10,
    top: '50%',
  },
  position: {
    position: 'absolute',
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  telemetryRow: {
    position: 'absolute',
    top: 20,
    left: 64,
    right: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  telemetryValue: {
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    backgroundColor: theme.neutral.mapOverlaySelector,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  unavailable: {
    color: theme.neutral.textMuted,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: theme.neutral.mapOverlaySelector,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mediaUnavailable: {
    color: theme.error.text,
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: theme.neutral.mapOverlaySelector,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
})
