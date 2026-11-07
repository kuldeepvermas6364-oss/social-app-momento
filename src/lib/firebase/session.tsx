import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {createMomentoAccount, type CreateMomentoAccountInput} from './account'
import {
  type FirebaseAuthUser,
  refreshFirebaseToken,
  sendFirebasePasswordResetEmail,
  signInWithFirebase,
} from './auth'
import {type FirebaseUserProfile, getFirebaseUserProfile} from './database'

const STORAGE_KEY = 'MOMENTO_FIREBASE_SESSION'
const REFRESH_MARGIN_MS = 60_000

type StoredFirebaseSession = {
  localId: string
  email: string
  refreshToken: string
}

type ActiveFirebaseSession = {
  user: FirebaseAuthUser
  expiresAt: number
}

type FirebaseAuthContextValue = {
  currentUser: FirebaseAuthUser | null
  currentProfile: FirebaseUserProfile | null
  isReady: boolean
  signIn: (email: string, password: string) => Promise<void>
  createAccount: (input: CreateMomentoAccountInput) => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string>
  sendPasswordResetEmail: (email: string) => Promise<void>
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null)
FirebaseAuthContext.displayName = 'FirebaseAuthContext'

function createActiveSession(user: FirebaseAuthUser): ActiveFirebaseSession {
  const expiresInSeconds = Number.parseInt(user.expiresIn, 10)
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('Firebase returned an invalid session expiry.')
  }
  return {
    user,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  }
}

function toStoredSession(user: FirebaseAuthUser): StoredFirebaseSession {
  return {
    localId: user.localId,
    email: user.email,
    refreshToken: user.refreshToken,
  }
}

export function FirebaseAuthProvider({children}: React.PropsWithChildren<{}>) {
  const [session, setSession] = useState<ActiveFirebaseSession | null>(null)
  const [currentProfile, setCurrentProfile] =
    useState<FirebaseUserProfile | null>(null)
  const [isReady, setIsReady] = useState(false)
  const sessionRef = useRef<ActiveFirebaseSession | null>(null)
  const sessionGenerationRef = useRef(0)

  const persistLatestSession = useCallback(async () => {
    const latest = sessionRef.current
    if (latest) {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(toStoredSession(latest.user)),
      )
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const applySession = useCallback(
    async (user: FirebaseAuthUser) => {
      const generation = ++sessionGenerationRef.current
      const nextSession = createActiveSession(user)
      sessionRef.current = nextSession
      setSession(nextSession)
      setCurrentProfile(null)
      try {
        const profile = await getFirebaseUserProfile(user.localId, user.idToken)
        if (generation !== sessionGenerationRef.current) return
        setCurrentProfile(profile)
      } catch {
        // Keep authentication available if the optional public profile is unavailable.
        if (generation !== sessionGenerationRef.current) return
        setCurrentProfile(null)
      }
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(toStoredSession(user)),
      )
      if (generation !== sessionGenerationRef.current) {
        await persistLatestSession()
      }
    },
    [persistLatestSession],
  )

  const clearSession = useCallback(async () => {
    const generation = ++sessionGenerationRef.current
    sessionRef.current = null
    setSession(null)
    setCurrentProfile(null)
    await AsyncStorage.removeItem(STORAGE_KEY)
    if (generation !== sessionGenerationRef.current) {
      await persistLatestSession()
    }
  }, [persistLatestSession])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const user = await signInWithFirebase(email, password)
      await applySession(user)
    },
    [applySession],
  )

  const createAccount = useCallback(
    async (input: CreateMomentoAccountInput) => {
      const user = await createMomentoAccount(input)
      await applySession(user)
    },
    [applySession],
  )

  const signOut = useCallback(async () => {
    await clearSession()
  }, [clearSession])

  const refreshActiveSession = useCallback(
    async (active: ActiveFirebaseSession): Promise<ActiveFirebaseSession> => {
      const generation = sessionGenerationRef.current
      if (sessionRef.current !== active) {
        throw new Error('Please sign in to continue.')
      }
      const refreshed = await refreshFirebaseToken(active.user.refreshToken)
      if (
        generation !== sessionGenerationRef.current ||
        sessionRef.current !== active
      ) {
        throw new Error('Please sign in to continue.')
      }
      const user: FirebaseAuthUser = {
        localId: refreshed.user_id,
        email: active.user.email,
        idToken: refreshed.id_token,
        refreshToken: refreshed.refresh_token,
        expiresIn: refreshed.expires_in,
        displayName: active.user.displayName,
        photoUrl: active.user.photoUrl,
        registered: true,
      }
      const nextSession = createActiveSession(user)
      sessionRef.current = nextSession
      setSession(nextSession)
      try {
        const refreshedProfile = await getFirebaseUserProfile(
          user.localId,
          user.idToken,
        )
        if (
          generation !== sessionGenerationRef.current ||
          sessionRef.current !== nextSession
        ) {
          throw new Error('Please sign in to continue.')
        }
        setCurrentProfile(refreshedProfile)
      } catch {
        if (
          generation !== sessionGenerationRef.current ||
          sessionRef.current !== nextSession
        ) {
          throw new Error('Please sign in to continue.')
        }
        setCurrentProfile(null)
      }
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(toStoredSession(user)),
      )
      if (
        generation !== sessionGenerationRef.current ||
        sessionRef.current !== nextSession
      ) {
        await persistLatestSession()
        throw new Error('Please sign in to continue.')
      }
      return nextSession
    },
    [persistLatestSession],
  )

  const getIdToken = useCallback(async () => {
    const active = sessionRef.current
    if (!active) {
      throw new Error('Please sign in to continue.')
    }
    if (active.expiresAt > Date.now() + REFRESH_MARGIN_MS) {
      return active.user.idToken
    }
    try {
      const refreshed = await refreshActiveSession(active)
      return refreshed.user.idToken
    } catch (cause) {
      if (
        sessionRef.current === active &&
        cause instanceof Error &&
        cause.message.toLowerCase().includes('session expired')
      ) {
        await clearSession()
      }
      throw cause
    }
  }, [refreshActiveSession, clearSession])

  const sendPasswordResetEmail = useCallback(async (email: string) => {
    await sendFirebasePasswordResetEmail(email)
  }, [])

  useEffect(() => {
    let mounted = true

    const restoreSession = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (!raw) return

        const stored = JSON.parse(raw) as Partial<StoredFirebaseSession>
        if (
          typeof stored.localId !== 'string' ||
          typeof stored.email !== 'string' ||
          typeof stored.refreshToken !== 'string'
        ) {
          await AsyncStorage.removeItem(STORAGE_KEY)
          return
        }

        const refreshed = await refreshFirebaseToken(stored.refreshToken)
        const user: FirebaseAuthUser = {
          localId: refreshed.user_id,
          email: stored.email,
          idToken: refreshed.id_token,
          refreshToken: refreshed.refresh_token,
          expiresIn: refreshed.expires_in,
          registered: true,
        }

        if (mounted) {
          await applySession(user)
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : ''
        if (message.includes('session expired')) {
          await AsyncStorage.removeItem(STORAGE_KEY)
        }
      } finally {
        if (mounted) setIsReady(true)
      }
    }

    void restoreSession()
    return () => {
      mounted = false
    }
  }, [applySession])

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({
      currentUser: session?.user ?? null,
      currentProfile,
      isReady,
      signIn,
      createAccount,
      signOut,
      getIdToken,
      sendPasswordResetEmail,
    }),
    [
      session,
      currentProfile,
      isReady,
      signIn,
      createAccount,
      signOut,
      getIdToken,
      sendPasswordResetEmail,
    ],
  )

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  )
}

export function useFirebaseAuth(): FirebaseAuthContextValue {
  const context = useContext(FirebaseAuthContext)
  if (!context) {
    throw new Error('useFirebaseAuth must be used within FirebaseAuthProvider.')
  }
  return context
}

/** Optional access for transitional screens and isolated component tests. */
export function useMaybeFirebaseAuth(): FirebaseAuthContextValue | null {
  return useContext(FirebaseAuthContext)
}
