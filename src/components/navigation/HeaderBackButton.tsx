import { useRouter } from 'expo-router'
import { ArrowLeftIcon } from 'phosphor-react-native'
import { StyleSheet, TouchableOpacity } from 'react-native'

export function HeaderBackButton() {
  const router = useRouter()

  return (
    <TouchableOpacity style={styles.button} onPress={() => router.back()} activeOpacity={0.7}>
      <ArrowLeftIcon size={18} color="#f9fafb" weight="bold" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
})
