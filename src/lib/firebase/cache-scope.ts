/**
 * Returns the cache namespace for the active Momento identity.
 *
 * Firebase Authentication UIDs and legacy AT Protocol DIDs are different
 * identity systems. They must never share persisted query data.
 */
export function getAccountCacheScope(
  firebaseUid: string | null | undefined,
  legacyDid: string | undefined,
): string {
  if (firebaseUid) {
    return `firebase-${firebaseUid}`
  }
  if (legacyDid) {
    return `atproto-${legacyDid}`
  }
  return 'logged-out'
}
