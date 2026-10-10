import { Redirect } from 'expo-router'

import { useSession } from '@/features/session/hooks'

/** First run asks for the server; after that, straight to sign-in. */
export default function AuthIndex() {
  const { serverUrl } = useSession()
  return <Redirect href={serverUrl ? '/login' : '/server'} />
}
