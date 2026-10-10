import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

/**
 * Credentials live in the Android Keystore-backed secure store and never leave
 * this device (no backup, not readable while the phone is locked). Everything
 * else is plain preference data.
 */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

const ACCESS_TOKEN = 'securo.accessToken'
const REFRESH_TOKEN = 'securo.refreshToken'
const SERVER_URL = 'securo.serverUrl'
const WORKSPACE_ID = 'securo.workspaceId'
const LANGUAGE = 'securo.language'

export interface StoredSession {
  serverUrl: string | null
  accessToken: string | null
  refreshToken: string | null
  workspaceId: string | null
}

export async function loadSession(): Promise<StoredSession> {
  const [serverUrl, workspaceId, accessToken, refreshToken] = await Promise.all([
    AsyncStorage.getItem(SERVER_URL),
    AsyncStorage.getItem(WORKSPACE_ID),
    SecureStore.getItemAsync(ACCESS_TOKEN, SECURE_OPTIONS),
    SecureStore.getItemAsync(REFRESH_TOKEN, SECURE_OPTIONS),
  ])
  return { serverUrl, workspaceId, accessToken, refreshToken }
}

export async function saveTokens(accessToken: string | null, refreshToken: string | null) {
  await Promise.all([
    setSecure(ACCESS_TOKEN, accessToken),
    setSecure(REFRESH_TOKEN, refreshToken),
  ])
}

export async function saveServerUrl(url: string | null) {
  await setItem(SERVER_URL, url)
}

export async function saveWorkspaceId(id: string | null) {
  await setItem(WORKSPACE_ID, id)
}

export async function loadLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(LANGUAGE)
}

export async function saveLanguage(language: string | null) {
  await setItem(LANGUAGE, language)
}

async function setSecure(key: string, value: string | null) {
  if (value) await SecureStore.setItemAsync(key, value, SECURE_OPTIONS)
  else await SecureStore.deleteItemAsync(key, SECURE_OPTIONS)
}

async function setItem(key: string, value: string | null) {
  if (value) await AsyncStorage.setItem(key, value)
  else await AsyncStorage.removeItem(key)
}
