import {assertFirebaseConfigured, firebaseConfig} from './config'

export type FirebaseAuthUser = {
  localId: string
  email: string
  idToken: string
  refreshToken: string
  expiresIn: string
  displayName?: string
  photoUrl?: string
  registered?: boolean
}

type FirebaseErrorResponse = {
  error?: {
    message?: string
  }
}

const IDENTITY_TOOLKIT_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts'
const SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token'

function authError(message: string): Error {
  const knownErrors: Record<string, string> = {
    EMAIL_EXISTS: 'An account with this email already exists.',
    EMAIL_NOT_FOUND: 'No account was found with this email.',
    INVALID_PASSWORD: 'The password is incorrect.',
    INVALID_LOGIN_CREDENTIALS: 'The email or password is incorrect.',
    USER_DISABLED: 'This account has been disabled.',
    WEAK_PASSWORD: 'Choose a stronger password.',
    INVALID_EMAIL: 'Enter a valid email address.',
    TOO_MANY_ATTEMPTS_TRY_LATER:
      'Too many attempts. Please wait and try again.',
    OPERATION_NOT_ALLOWED:
      'Email and password sign-in is not enabled for this Firebase project.',
    TOKEN_EXPIRED: 'Your sign-in session expired. Please sign in again.',
    INVALID_REFRESH_TOKEN: 'Your sign-in session expired. Please sign in again.',
  }

  const code = message.split(':')[0].trim()
  return new Error(
    knownErrors[code] ?? 'Firebase authentication failed. Please try again.',
  )
}

async function postAuthRequest<T>(
  endpoint: string,
  body: Record<string, string | boolean>,
): Promise<T> {
  assertFirebaseConfigured()

  const response = await fetch(
    `${endpoint}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    },
  )

  const data = (await response.json()) as T & FirebaseErrorResponse
  if (!response.ok) {
    throw authError(data.error?.message ?? 'UNKNOWN_ERROR')
  }
  return data
}

/** Create a Momento account with Firebase Email/Password authentication. */
export function createFirebaseAccount(
  email: string,
  password: string,
  displayName?: string,
): Promise<FirebaseAuthUser> {
  return postAuthRequest<FirebaseAuthUser>(
    `${IDENTITY_TOOLKIT_URL}:signUp`,
    {
      email: email.trim().toLowerCase(),
      password,
      ...(displayName ? {displayName: displayName.trim()} : {}),
      returnSecureToken: true,
    },
  )
}

/** Sign in an existing Momento account with Firebase Authentication. */
export function signInWithFirebase(
  email: string,
  password: string,
): Promise<FirebaseAuthUser> {
  return postAuthRequest<FirebaseAuthUser>(
    `${IDENTITY_TOOLKIT_URL}:signInWithPassword`,
    {email: email.trim().toLowerCase(), password, returnSecureToken: true},
  )
}

/** Exchange a Firebase refresh token for a fresh ID token. */
export async function refreshFirebaseToken(
  refreshToken: string,
): Promise<{
  id_token: string
  refresh_token: string
  expires_in: string
  user_id: string
}> {
  assertFirebaseConfigured()

  const response = await fetch(
    `${SECURE_TOKEN_URL}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    },
  )

  const data = (await response.json()) as {
    id_token?: string
    refresh_token?: string
    expires_in?: string
    user_id?: string
    error?: {message?: string}
  }

  if (
    !response.ok ||
    !data.id_token ||
    !data.refresh_token ||
    !data.expires_in ||
    !data.user_id
  ) {
    throw authError(data.error?.message ?? 'TOKEN_EXPIRED')
  }

  return {
    id_token: data.id_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    user_id: data.user_id,
  }
}

/** Read the authenticated Firebase user profile from the Identity Toolkit. */
export type FirebaseAuthProfile = {
  localId: string
  email: string
  displayName?: string
  photoUrl?: string
  emailVerified: boolean
}

export async function getFirebaseAuthUser(
  idToken: string,
): Promise<FirebaseAuthProfile> {
  const response = await postAuthRequest<{
    users?: FirebaseAuthProfile[]
  }>(`${IDENTITY_TOOLKIT_URL}:lookup`, {idToken})

  const user = response.users?.[0]
  if (!user) {
    throw new Error('Firebase did not return the signed-in user profile.')
  }
  return user
}


/** Delete a newly created account when its initial profile cannot be saved. */
export async function deleteFirebaseAccount(idToken: string): Promise<void> {
  await postAuthRequest<Record<string, never>>(
    `${IDENTITY_TOOLKIT_URL}:delete`,
    {idToken},
  )
}


/** Send a Firebase password-reset email. */
export async function sendFirebasePasswordResetEmail(
  email: string,
): Promise<void> {
  await postAuthRequest<Record<string, never>>(
    `${IDENTITY_TOOLKIT_URL}:sendOobCode`,
    {
      requestType: 'PASSWORD_RESET',
      email: email.trim().toLowerCase(),
    },
  )
}
