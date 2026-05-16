import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { UserCircleIcon } from 'phosphor-react-native'

import { Placeholder } from '@/components/Placeholder'

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Placeholder icon={UserCircleIcon} description="Profile settings will appear here." />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
})
