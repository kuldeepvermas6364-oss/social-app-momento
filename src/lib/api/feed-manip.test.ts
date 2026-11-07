import {type app} from '#/lexicons'
import {createFeedViewPostsSlices, FeedTuner} from './feed-manip'

jest.mock('./feed/home', () => ({
  FALLBACK_MARKER_POST: {post: {uri: 'at://did:plc:test/app.bsky.feed.post/1'}},
}))

const author = {
  $type: 'app.bsky.actor.defs#profileViewBasic',
  did: 'did:plc:alice',
  handle: 'alice.test',
} satisfies app.bsky.actor.defs.ProfileViewBasic

function post(
  id: string,
): app.bsky.feed.defs.PostView & {$type: 'app.bsky.feed.defs#postView'} {
  return {
    $type: 'app.bsky.feed.defs#postView',
    uri: `at://did:plc:alice/app.bsky.feed.post/${id}`,
    cid: id,
    author,
    record: {
      $type: 'app.bsky.feed.post',
      text: id,
      createdAt: '2026-08-31T00:00:00.000Z',
    },
    indexedAt: '2026-08-31T00:00:00.000Z',
  }
}

describe('createFeedViewPostsSlices', () => {
  it('preserves selected numbering and infers hydrated parent and root numbering', () => {
    const root = post('root')
    const parent = post('parent')
    const selected = post('selected')
    const feedPost = {
      post: selected,
      reply: {root, parent},
      opThreadPostIndex: 3,
      opThreadPostCount: 4,
    } satisfies app.bsky.feed.defs.FeedViewPost

    const [slice] = createFeedViewPostsSlices([feedPost])

    expect(
      slice.items.map(item => [item.post.uri, item.postNumbering]),
    ).toEqual([
      [root.uri, {opThreadPostIndex: 1, opThreadPostCount: 4}],
      [parent.uri, {opThreadPostIndex: 2, opThreadPostCount: 4}],
      [selected.uri, {opThreadPostIndex: 3, opThreadPostCount: 4}],
    ])
  })
})

describe('Momento For You ranking', () => {
  it('ranks stronger engagement ahead of weaker engagement', () => {
    const popular = post('popular')
    popular.likeCount = 120
    popular.repostCount = 20
    const quiet = post('quiet')
    quiet.likeCount = 0
    quiet.repostCount = 0

    const slices = createFeedViewPostsSlices([
      {post: quiet},
      {post: popular},
    ] satisfies app.bsky.feed.defs.FeedViewPost[])

    const ranked = FeedTuner.momentoForYou(new FeedTuner([]), slices, false)

    expect(ranked.map(slice => slice.feedPostUri)).toEqual([
      popular.uri,
      quiet.uri,
    ])
  })

  it('keeps original order when ranking scores are equal', () => {
    const first = post('first')
    const second = post('second')
    const slices = createFeedViewPostsSlices([
      {post: first},
      {post: second},
    ] satisfies app.bsky.feed.defs.FeedViewPost[])

    const ranked = FeedTuner.momentoForYou(new FeedTuner([]), slices, false)

    expect(ranked.map(slice => slice.feedPostUri)).toEqual([
      first.uri,
      second.uri,
    ])
  })
})
