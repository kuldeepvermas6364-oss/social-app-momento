import {firebaseConfig} from './config'

export type FirebaseUserProfile = {
  uid: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string | null
  createdAt: number
  updatedAt: number
}

type FirebaseDatabaseError = {
  error?: string
}

function databaseUrl(path: string, idToken: string): string {
  const normalizedPath = path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `${firebaseConfig.databaseURL}/${normalizedPath}.json?auth=${encodeURIComponent(idToken)}`
}

async function parseDatabaseResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | (T & FirebaseDatabaseError)
    | null
  if (!response.ok) {
    throw new Error(
      data && typeof data.error === 'string'
        ? data.error
        : 'Unable to save your Momento profile. Please try again.',
    )
  }
  return data as T
}

/**
 * Reserve a username with a conditional write. The null_etag precondition
 * prevents two new accounts from claiming the same username concurrently.
 */
export async function claimFirebaseUsername(
  username: string,
  uid: string,
  idToken: string,
): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase()
  if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
    throw new Error(
      'Username must be 3–20 characters and use only letters, numbers, or underscores.',
    )
  }

  const response = await fetch(
    databaseUrl(`usernames/${normalizedUsername}`, idToken),
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'if-match': 'null_etag',
      },
      body: JSON.stringify(uid),
    },
  )

  if (response.status === 412) {
    throw new Error('That username is already taken. Choose another one.')
  }
  await parseDatabaseResponse<unknown>(response)
}

/** Remove a username reservation if account setup fails after claiming it. */
export async function releaseFirebaseUsername(
  username: string,
  idToken: string,
): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase()
  const response = await fetch(
    databaseUrl(`usernames/${normalizedUsername}`, idToken),
    {method: 'DELETE'},
  )
  await parseDatabaseResponse<unknown>(response)
}

/**
 * Persist the public profile and private account metadata in one atomic RTDB
 * multi-location update. Email is deliberately kept outside the public users
 * tree so public profile reads never expose it.
 */
export async function createFirebaseUserProfile(
  profile: FirebaseUserProfile,
  email: string,
  idToken: string,
): Promise<void> {
  const updates = {
    [`users/${profile.uid}`]: profile,
    [`privateUsers/${profile.uid}`]: {
      email: email.trim().toLowerCase(),
      createdAt: profile.createdAt,
    },
  }

  const response = await fetch(databaseUrl('', idToken), {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(updates),
  })
  await parseDatabaseResponse<unknown>(response)
}
