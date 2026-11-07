/**
 * Public Firebase client configuration for Momento.
 *
 * The Firebase web API key is supplied at build time through
 * EXPO_PUBLIC_FIREBASE_API_KEY. It is an app identifier, not an Admin SDK
 * credential. Never put service-account JSON or Admin private keys here.
 */
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: 'momento-816d1.firebaseapp.com',
  databaseURL:
    'https://momento-816d1-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'momento-816d1',
  storageBucket: 'momento-816d1.firebasestorage.app',
  messagingSenderId: '572912696071',
  appId: '1:572912696071:android:2f3a21e14f95f71bde63a2',
} as const

export function assertFirebaseConfigured(): void {
  if (!firebaseConfig.apiKey) {
    throw new Error(
      'Firebase is not configured. Set EXPO_PUBLIC_FIREBASE_API_KEY in the build environment.',
    )
  }
}
