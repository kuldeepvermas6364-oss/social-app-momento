import {
  createFirebaseAccount,
  deleteFirebaseAccount,
  type FirebaseAuthUser,
} from './auth'
import {
  claimFirebaseUsername,
  createFirebaseUserProfile,
  releaseFirebaseUsername,
} from './database'

export type CreateMomentoAccountInput = {
  email: string
  password: string
  username: string
  displayName: string
}

/**
 * Creates the Firebase identity and its Momento profile as one signup flow.
 * If profile setup fails, the Auth account and username reservation are
 * cleaned up so the user is not left with a partially-created account.
 */
export async function createMomentoAccount(
  input: CreateMomentoAccountInput,
): Promise<FirebaseAuthUser> {
  const email = input.email.trim().toLowerCase()
  const username = input.username.trim().toLowerCase()
  const displayName = input.displayName.trim()
  const authUser = await createFirebaseAccount(email, input.password)
  let usernameClaimed = false

  try {
    await claimFirebaseUsername(username, authUser.localId, authUser.idToken)
    usernameClaimed = true

    const now = Date.now()
    await createFirebaseUserProfile(
      {
        uid: authUser.localId,
        username,
        displayName: displayName || username,
        bio: '',
        avatarUrl: null,
        createdAt: now,
        updatedAt: now,
      },
      email,
      authUser.idToken,
    )

    return authUser
  } catch (error) {
    if (usernameClaimed) {
      try {
        await releaseFirebaseUsername(username, authUser.idToken)
      } catch {
        // Preserve the original signup error; account cleanup still proceeds.
      }
    }

    try {
      await deleteFirebaseAccount(authUser.idToken)
    } catch {
      // Preserve the original signup error if the cleanup request also fails.
    }

    throw error
  }
}
