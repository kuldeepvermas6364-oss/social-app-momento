jest.mock('./auth', () => ({
  createFirebaseAccount: jest.fn(),
  deleteFirebaseAccount: jest.fn(),
}))

jest.mock('./database', () => ({
  claimFirebaseUsername: jest.fn(),
  createFirebaseUserProfile: jest.fn(),
  releaseFirebaseUsername: jest.fn(),
}))

import {createMomentoAccount} from './account'
import {createFirebaseAccount, deleteFirebaseAccount} from './auth'
import {
  claimFirebaseUsername,
  createFirebaseUserProfile,
  releaseFirebaseUsername,
} from './database'

const firebaseUser = {
  localId: 'firebase-uid',
  email: 'person@example.com',
  idToken: 'firebase-id-token',
  refreshToken: 'firebase-refresh-token',
  expiresIn: '3600',
}

const input = {
  email: ' Person@Example.com ',
  password: 'a-strong-test-password',
  username: ' Person_1 ',
  displayName: ' Person One ',
}

describe('createMomentoAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(createFirebaseAccount).mockResolvedValue(firebaseUser)
    jest.mocked(claimFirebaseUsername).mockResolvedValue(undefined)
    jest.mocked(createFirebaseUserProfile).mockResolvedValue(undefined)
    jest.mocked(releaseFirebaseUsername).mockResolvedValue(undefined)
    jest.mocked(deleteFirebaseAccount).mockResolvedValue(undefined)
  })

  it('creates a Firebase account, reserves its username, and writes its profile', async () => {
    await expect(createMomentoAccount(input)).resolves.toEqual(firebaseUser)

    expect(createFirebaseAccount).toHaveBeenCalledWith(
      'person@example.com',
      input.password,
      'Person One',
    )
    expect(claimFirebaseUsername).toHaveBeenCalledWith(
      'person_1',
      'firebase-uid',
      'firebase-id-token',
    )
    expect(createFirebaseUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'firebase-uid',
        username: 'person_1',
        displayName: 'Person One',
        bio: '',
      }),
      'person@example.com',
      'firebase-id-token',
    )
  })

  it('releases the username and deletes the Auth account when profile creation fails', async () => {
    const profileError = new Error('RTDB profile write failed')
    jest.mocked(createFirebaseUserProfile).mockRejectedValueOnce(profileError)

    await expect(createMomentoAccount(input)).rejects.toBe(profileError)

    expect(releaseFirebaseUsername).toHaveBeenCalledWith(
      'person_1',
      'firebase-id-token',
    )
    expect(deleteFirebaseAccount).toHaveBeenCalledWith('firebase-id-token')
  })

  it('deletes the new Auth account when the username is already taken', async () => {
    const usernameError = new Error('That username is already taken.')
    jest.mocked(claimFirebaseUsername).mockRejectedValueOnce(usernameError)

    await expect(createMomentoAccount(input)).rejects.toBe(usernameError)

    expect(releaseFirebaseUsername).not.toHaveBeenCalled()
    expect(deleteFirebaseAccount).toHaveBeenCalledWith('firebase-id-token')
    expect(createFirebaseUserProfile).not.toHaveBeenCalled()
  })
})
