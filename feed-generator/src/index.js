 * This service ranks public candidate posts from the Bluesky AppView.
 * It deliberately excludes Momento Story records from the public For You feed.
 */
const APPVIEW = 'https://api.bsky.app'
const FEED_RKEY = 'for-you'
const FEED_URI = 'app.bsky.feed.generator/' + FEED_RKEY
const QUERIES = ['photography', 'art', 'technology', 'music', 'India']
const MAX_LIMIT = 50
const CACHE_SECONDS = 90

let candidateCache = {expiresAt: 0, posts: []}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'cache-control': 'no-store',
      ...headers,
    },
  })
}

function score(post, now) {
  const created = Date.parse(post.indexedAt || post.record?.createdAt || '')
  const ageHours = Number.isFinite(created)
    ? Math.max(0, (now - created) / 3600000)
    : 168
  const freshness = 10 * Math.exp(-ageHours / 48)
  const engagement =
    1.6 * Math.log1p(post.likeCount || 0) +
    2.2 * Math.log1p(post.repostCount || 0) +
    2.8 * Math.log1p(post.replyCount || 0)
  const hasMedia = Boolean(post.embed)
  return freshness + engagement + (hasMedia ? 1 : 0)
}

function isStory(post) {
  const tags = post.record?.tags || []
  return tags.some(tag => String(tag).toLowerCase() === 'momento-story')
}

async function getCandidates() {
  const now = Date.now()
  if (candidateCache.expiresAt > now && candidateCache.posts.length) {
    return candidateCache.posts
  }

  const results = await Promise.allSettled(
    QUERIES.map(async q => {
      const url = new URL('/xrpc/app.bsky.feed.searchPosts', APPVIEW)
      url.searchParams.set('q', q)
      url.searchParams.set('sort', 'top')
      url.searchParams.set('limit', '100')
      const response = await fetch(url, {
        headers: {accept: 'application/json'},
      })
      if (!response.ok) {
        throw new Error('AppView search failed: ' + response.status)
      }
      const body = await response.json()
      return Array.isArray(body.posts) ? body.posts : []
    }),
  )

  const posts = new Map()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const post of result.value) {
      if (!post?.uri || isStory(post)) continue
      const previous = posts.get(post.uri)
      if (!previous || score(post, now) > score(previous, now)) {
        posts.set(post.uri, post)
      }
    }
  }

  const ranked = [...posts.values()]
    .map((post, index) => ({post, index, score: score(post, now)}))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({post}) => post)

  if (!ranked.length) {
    throw new Error('No public feed candidates are available right now')
  }

  candidateCache = {expiresAt: now + CACHE_SECONDS * 1000, posts: ranked}
  return ranked
}

function didDocument(hostname) {
  const id = 'did:web:' + hostname
  const endpoint = 'https://' + hostname
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id,
    service: [
      {
        id: id + '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: endpoint,
      },
    ],
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
        },
      })
    }

    if (request.method !== 'GET') {
      return json({error: 'Method not allowed'}, 405)
    }

    if (url.pathname === '/.well-known/did.json') {
      return json(didDocument(url.hostname), 200, {
        'cache-control': 'public, max-age=300',
      })
    }

    if (url.pathname === '/xrpc/app.bsky.feed.describeFeedGenerator') {
      if (!env.FEED_URI) {
        return json({error: 'Feed record URI is not configured yet'}, 503)
      }
      return json({
        did: 'did:web:' + url.hostname,
        feeds: [{uri: env.FEED_URI}],
      })
    }

    if (url.pathname !== '/xrpc/app.bsky.feed.getFeedSkeleton') {
      return json({error: 'Not found'}, 404)
    }

    const feed = url.searchParams.get('feed')
    if (
      feed &&
      (env.FEED_URI ? feed !== env.FEED_URI : !feed.endsWith('/' + FEED_URI))
    ) {
      return json({error: 'Unknown feed'}, 400)
    }

    const requestedLimit = Number(url.searchParams.get('limit') || 30)
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)))
      : 30
    const cursorValue = Number(url.searchParams.get('cursor') || 0)
    const offset =
      Number.isSafeInteger(cursorValue) && cursorValue >= 0
        ? Math.min(cursorValue, 10000)
        : 0

    try {
      const candidates = await getCandidates()
      const page = candidates.slice(offset, offset + limit)
      const nextOffset = offset + page.length
      return json({
        feed: page.map(post => ({post: post.uri})),
        ...(nextOffset < candidates.length ? {cursor: String(nextOffset)} : {}),
      })
    } catch (error) {
      return json(
        {error: 'Feed temporarily unavailable', message: String(error)},
        503,
        {'retry-after': '60'},
      )
    }
  },
}
 PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
