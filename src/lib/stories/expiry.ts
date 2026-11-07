/**
 * Momento stories are short-lived records. Expiry is stored in the AT Protocol
 * record so every client can independently hide a story without a private
 * server-side clock.
 */
export const STORY_DURATION_MS = 24 * 60 * 60 * 1000

export type StoryTimestamps = {
  createdAt: string
  expiresAt: string
}

/** Returns the canonical ISO expiry timestamp for a story created at a time. */
export function getStoryExpiresAt(createdAt: Date | string): string {
  const createdAtMs =
    createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt)

  if (!Number.isFinite(createdAtMs)) {
    throw new RangeError('Story createdAt must be a valid date')
  }

  return new Date(createdAtMs + STORY_DURATION_MS).toISOString()
}

/**
 * A story is active only when both timestamps are valid, it has not expired,
 * and its declared lifetime does not exceed the 24-hour product limit.
 * Invalid or malformed records fail closed and are never shown.
 */
export function isStoryActive(
  story: StoryTimestamps,
  now: number = Date.now(),
): boolean {
  const createdAt = Date.parse(story.createdAt)
  const expiresAt = Date.parse(story.expiresAt)

  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(now)
  ) {
    return false
  }

  return (
    createdAt <= now &&
    expiresAt > now &&
    expiresAt > createdAt &&
    expiresAt <= createdAt + STORY_DURATION_MS
  )
}
