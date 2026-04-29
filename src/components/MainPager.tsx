import { Children, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

export interface MainPagerHandle {
  setPage: (page: number) => void
}

interface MainPagerProps {
  page: number
  onPageChange: (page: number) => void
  children: ReactNode
}

export const MainPager = forwardRef<MainPagerHandle, MainPagerProps>(function MainPager(
  { page, onPageChange, children },
  ref,
) {
  useImperativeHandle(
    ref,
    () => ({
      setPage: onPageChange,
    }),
    [onPageChange],
  )

  return <View style={styles.pager}>{Children.toArray(children)[page]}</View>
})

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
})
