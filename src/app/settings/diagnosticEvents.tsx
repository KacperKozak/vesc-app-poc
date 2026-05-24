import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native'
import { getDiagnosticEvents, type LocalDiagnosticEvent } from 'vesc-ble'

const PAGE_SIZE = 50

function formatProperties(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}

function EventItem({
  event,
  expanded,
  onToggle,
}: {
  event: LocalDiagnosticEvent
  expanded: boolean
  onToggle: (id: number) => void
}) {
  const time = new Date(event.occurredAtMs).toLocaleTimeString()
  const meta = [event.operation, event.phase, event.deviceName].filter(Boolean).join(' · ')

  return (
    <Pressable style={styles.eventRow} onPress={() => onToggle(event.id)}>
      <View style={styles.eventHeader}>
        <Text style={styles.eventTime}>{time}</Text>
        <Text style={styles.eventName} numberOfLines={expanded ? undefined : 1}>
          {event.eventName}
        </Text>
      </View>
      {meta ? <Text style={styles.eventMeta}>{meta}</Text> : null}
      {event.message ? (
        <Text style={styles.eventMessage} numberOfLines={expanded ? undefined : 1}>
          {event.message}
        </Text>
      ) : null}
      {expanded ? (
        <View style={styles.eventExpanded}>
          <Text style={styles.fieldLabel}>timestamp</Text>
          <Text style={styles.fieldValue} selectable>
            {new Date(event.occurredAtMs).toLocaleString()}
          </Text>
          {event.deviceId ? (
            <>
              <Text style={[styles.fieldLabel, styles.fieldGap]}>deviceId</Text>
              <Text style={styles.fieldValue} selectable>
                {event.deviceId}
              </Text>
            </>
          ) : null}
          <Text style={[styles.fieldLabel, styles.fieldGap]}>properties</Text>
          <Text style={styles.eventJson} selectable>
            {formatProperties(event.propertiesJson)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export default function DiagnosticEventsScreen() {
  const [events, setEvents] = useState<LocalDiagnosticEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const loadingRef = useRef(false)

  const loadPage = useCallback(async (cursor?: number) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const page = await getDiagnosticEvents({
        toMs: cursor,
        limit: PAGE_SIZE,
      })
      if (page.length < PAGE_SIZE) setHasMore(false)
      setEvents((prev) => (cursor === undefined ? page : [...prev, ...page]))
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => {
    void loadPage()
  }, [])

  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current || events.length === 0) return
    const oldest = events[events.length - 1]
    void loadPage(oldest.occurredAtMs - 1)
  }, [hasMore, events, loadPage])

  const refresh = useCallback(() => {
    setHasMore(true)
    setExpandedId(null)
    void loadPage(undefined)
  }, [loadPage])

  const toggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LocalDiagnosticEvent>) => (
      <EventItem event={item} expanded={expandedId === item.id} onToggle={toggleExpand} />
    ),
    [expandedId, toggleExpand],
  )

  const keyExtractor = useCallback((item: LocalDiagnosticEvent) => String(item.id), [])

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={events}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      onRefresh={refresh}
      refreshing={loading && events.length === 0}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No local diagnostic events</Text>
          </View>
        )
      }
      ListFooterComponent={
        loading && events.length > 0 ? (
          <ActivityIndicator color="#64748b" style={styles.footer} />
        ) : !hasMore && events.length > 0 ? (
          <Text style={styles.footerText}>— end —</Text>
        ) : null
      }
    />
  )
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 12,
  },
  separator: {
    height: 4,
  },
  emptyCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 14,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
  footer: {
    paddingVertical: 16,
  },
  footerText: {
    color: '#334155',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  eventRow: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 10,
    gap: 2,
  },
  eventHeader: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'baseline',
  },
  eventTime: {
    color: '#64748b',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  eventName: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  eventMeta: {
    color: '#64748b',
    fontSize: 11,
  },
  eventMessage: {
    color: '#94a3b8',
    fontSize: 12,
  },
  eventExpanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 2,
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fieldGap: {
    marginTop: 6,
  },
  fieldValue: {
    color: '#f1f5f9',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  eventJson: {
    color: '#f1f5f9',
    fontSize: 11,
    fontFamily: 'monospace',
  },
})
