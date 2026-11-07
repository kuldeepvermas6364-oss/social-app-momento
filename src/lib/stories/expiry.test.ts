import {getStoryExpiresAt, isStoryActive, STORY_DURATION_MS} from './expiry'

describe('Momento story expiry', () => {
  const createdAt = '2026-11-07T10:00:00.000Z'
  const createdAtMs = Date.parse(createdAt)

  it('sets expiry exactly 24 hours after creation', () => {
    expect(getStoryExpiresAt(createdAt)).toBe('2026-11-08T10:00:00.000Z')
  })

  it('accepts a story before its expiry', () => {
    expect(
      isStoryActive(
        {
          createdAt,
          expiresAt: getStoryExpiresAt(createdAt),
        },
        createdAtMs + STORY_DURATION_MS - 1,
      ),
    ).toBe(true)
  })

  it('hides a story at the expiry boundary', () => {
    expect(
      isStoryActive(
        {
          createdAt,
          expiresAt: getStoryExpiresAt(createdAt),
        },
        createdAtMs + STORY_DURATION_MS,
      ),
    ).toBe(false)
  })

  it('rejects malformed timestamps and lifetimes longer than 24 hours', () => {
    expect(
      isStoryActive({createdAt: 'invalid', expiresAt: createdAt}, createdAtMs),
    ).toBe(false)
    expect(
      isStoryActive(
        {
          createdAt,
          expiresAt: new Date(
            createdAtMs + STORY_DURATION_MS + 1,
          ).toISOString(),
        },
        createdAtMs + 1,
      ),
    ).toBe(false)
  })

  it('rejects a story created in the future', () => {
    expect(
      isStoryActive(
        {
          createdAt,
          expiresAt: getStoryExpiresAt(createdAt),
        },
        createdAtMs - 1,
      ),
    ).toBe(false)
  })

  it('rejects an invalid creation date when calculating expiry', () => {
    expect(() => getStoryExpiresAt('not-a-date')).toThrow(RangeError)
  })
})
