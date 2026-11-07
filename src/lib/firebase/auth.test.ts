jest.mock('./config', () => ({
  assertFirebaseConfigured: jest.fn(),
  firebaseConfig: {
    apiKey: 'test-api-key',
    databaseURL:
      'https://momento-816d1-default-rtdb.asia-southeast1.firebasedatabase.app',
  },
}))

import {
  createFirebaseAccount,
  refreshFirebaseToken,
  signInWithFirebase,
} from './auth'

const fetchMock = jest.spyOn(global, 'fetch')

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('Momento Firebase Authentication REST client', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  afterAll(() => {
    fetchMock.mockRestore()
  })

  it('creates an account with a normalized email and secure token response', async () => {
    const user = {
      localId: 'firebase-uid',
      email: 'person@example.com',
      idToken: 'id-token',
      refreshToken: 'refresh-token',
      expiresIn: '3600',
    }
    fetchMock.mockResolvedValueOnce(response(user))

    await expect(
      createFirebaseAccount(' Person@Example.com ', 'password123', 'Person'),
    ).resolves.toEqual(user)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'person@example.com',
          password: 'password123',
          displayName: 'Person',
          returnSecureToken: true,
        }),
      }),
    )
  })

  it('signs in with Firebase email/password credentials', async () => {
    const user = {
      localId: 'firebase-uid',
      email: 'person@example.com',
      idToken: 'id-token',
      refreshToken: 'refresh-token',
      expiresIn: '3600',
    }
    fetchMock.mockResolvedValueOnce(response(user))

    await expect(
      signInWithFirebase(' PERSON@example.com ', 'password123'),
    ).resolves.toEqual(user)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-api-key',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'person@example.com',
          password: 'password123',
          returnSecureToken: true,
        }),
      }),
    )
  })

  it('rotates refresh tokens and returns the normalized token payload', async () => {
    const refreshed = {
      id_token: 'new-id-token',
      refresh_token: 'new-refresh-token',
      expires_in: '3600',
      user_id: 'firebase-uid',
    }
    fetchMock.mockResolvedValueOnce(response(refreshed))

    await expect(refreshFirebaseToken('old-refresh-token')).resolves.toEqual(
      refreshed,
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://securetoken.googleapis.com/v1/token?key=test-api-key',
      expect.objectContaining({
        method: 'POST',
        body: 'grant_type=refresh_token&refresh_token=old-refresh-token',
      }),
    )
  })

  it('returns a safe error for invalid credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      response({error: {message: 'INVALID_LOGIN_CREDENTIALS'}}, false, 400),
    )

    await expect(
      signInWithFirebase('person@example.com', 'wrong-password'),
    ).rejects.toThrow('The email or password is incorrect.')
  })

  it('rejects incomplete refresh-token responses', async () => {
    fetchMock.mockResolvedValueOnce(response({id_token: 'incomplete'}))

    await expect(refreshFirebaseToken('old-refresh-token')).rejects.toThrow(
      'Your sign-in session expired. Please sign in again.',
    )
  })
})
