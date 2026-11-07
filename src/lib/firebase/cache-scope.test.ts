import {getAccountCacheScope} from './cache-scope'

describe('getAccountCacheScope', () => {
  it('isolates each Firebase account by its UID', () => {
    expect(getAccountCacheScope('firebase-user-a', undefined)).toBe(
      'firebase-firebase-user-a',
    )
    expect(getAccountCacheScope('firebase-user-b', undefined)).toBe(
      'firebase-firebase-user-b',
    )
  })

  it('does not confuse a Firebase UID with a legacy AT Protocol DID', () => {
    expect(getAccountCacheScope('firebase-user-a', 'did:plc:legacy-user')).toBe(
      'firebase-firebase-user-a',
    )
    expect(getAccountCacheScope(undefined, 'did:plc:legacy-user')).toBe(
      'atproto-did:plc:legacy-user',
    )
  })

  it('uses a logged-out namespace when no identity is present', () => {
    expect(getAccountCacheScope(null, undefined)).toBe('logged-out')
  })
})
