import {type Client} from '@atproto/lex'

import {app} from '#/lexicons'
import {FollowingFeedAPI} from './following'

describe('FollowingFeedAPI', () => {
  it('returns undefined when the following timeline is empty', async () => {
    const call = jest.fn().mockResolvedValue({feed: []})
    const api = new FollowingFeedAPI({
      client: {call} as unknown as Client,
    })

    await expect(api.peekLatest()).resolves.toBeUndefined()
    expect(call).toHaveBeenCalledWith(app.bsky.feed.getTimeline, {
      limit: 1,
    })
  })
})
