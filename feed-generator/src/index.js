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
 ● Console
   console.log
     [31m08:27:41[39m [31m(logger)[39m Failed to refresh posts feed {
       "safeMessage": "Error: offline"
     }
     at log (src/logger/transports/console.ts:67:13)
         at Generator.throw (<anonymous>)
   console.log
     [31m08:27:41[39m [31m(logger)[39m Failed to refresh posts feed {
       "safeMessage": "Error: offline"
     }
     at log (src/logger/transports/console.ts:67:13)
         at Generator.throw (<anonymous>)
   console.log
     [31m08:27:41[39m [31m(logger)[39m Failed to refresh posts feed {
       "safeMessage": "Error: still offline"
     }
     at log (src/logger/transports/console.ts:67:13)
         at Generator.throw (<anonymous>)
   console.log
     [31m08:27:41[39m [31m(logger)[39m Failed to refresh posts feed {
       "safeMessage": "Error: offline"
     }
     at log (src/logger/transports/console.ts:67:13)
         at Generator.throw (<anonymous>)
 ● Console
   console.log
     [33m08:27:43[39m [33m(growthbook)[39m GrowthBook initialization failed or timed out {
       "source": "error",
       "safeMessage": "Error: HTTP error: undefined"
     }
     at log (src/logger/transports/console.ts:67:13)
 ● Console
   console.log
     [36m08:28:02[39m [36m(logger)[39m 7a5nleTIKdiOLrM5nrkHx {}
     at log (src/logger/transports/console.ts:67:13)
 ● Console
   console.error
     Invalid URI invalid-uri TypeError: Invalid URL: invalid-uri
         at new URL (/home/runner/work/social-app-momento/social-app-momento/node_modules/whatwg-url-minimum/src/URLImpl.ts:57:13)
         at /home/runner/work/social-app-momento/social-app-momento/src/lib/media/manip.ts:57:5
         at Generator.next (<anonymous>)
         at asyncGeneratorStep (/home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
         at _next (/home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
         at /home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:22:7
         at new Promise (<anonymous>)
         at /home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:14:12
         at apply (/home/runner/work/social-app-momento/social-app-momento/src/lib/media/manip.ts:55:40)
         at Object.<anonymous> (/home/runner/work/social-app-momento/social-app-momento/__tests__/lib/images.test.ts:182:43)
         at Generator.next (<anonymous>)
         at asyncGeneratorStep (/home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
         at _next (/home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
         at /home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:22:7
         at new Promise (<anonymous>)
         at Object.<anonymous> (/home/runner/work/social-app-momento/social-app-momento/node_modules/@babel/runtime/helpers/asyncToGenerator.js:14:12)
         at Promise.finally.completed (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:1834:28)
         at new Promise (<anonymous>)
         at callAsyncCircusFn (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:1774:10)
         at _callCircusTest (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:1167:40)
         at _runTestInContext (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:1103:3)
         at runTestWithContext (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:996:5)
         at _runTestsForDescribeBlockOnce (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:1008:11)
         at _runTestsForDescribeBlock (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:824:5)
         at _runTestsForDescribeBlockOnce (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:1003:11)
         at _runTestsForDescribeBlock (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:824:5)
         at run (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:789:3)
         at runAndTransformResultsToJestFormat (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/jestAdapterInit.js:2300:21)
         at jestAdapter (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-circus/build/runner.js:111:19)
         at runTestInternal (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-runner/build/index.js:247:16)
         at runTest (/home/runner/work/social-app-momento/social-app-momento/node_modules/jest-runner/build/index.js:315:7)
   [0m [90m 57 |[39m     [36mnew[39m [33mURL[39m(opts[33m.[39muri)
    [90m 58 |[39m   } [36mcatch[39m (e[33m:[39m any) {
   [31m[1m>[22m[39m[90m 59 |[39m     console[33m.[39merror([32m'Invalid URI'[39m[33m,[39m opts[33m.[39muri[33m,[39m e)
    [90m    |[39m             [31m[1m^[22m[39m
    [90m 60 |[39m     [36mreturn[39m
    [90m 61 |[39m   }
    [90m 62 |[39m[0m
     at console.<anonymous> (node_modules/jest-mock/build/index.js:740:25)
     at error (src/lib/media/manip.ts:59:13)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
     at node_modules/@babel/runtime/helpers/asyncToGenerator.js:22:7
     at node_modules/@babel/runtime/helpers/asyncToGenerator.js:14:12
     at apply (src/lib/media/manip.ts:55:40)
     at Object.<anonymous> (__tests__/lib/images.test.ts:182:43)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
     at node_modules/@babel/runtime/helpers/asyncToGenerator.js:22:7
     at Object.<anonymous> (node_modules/@babel/runtime/helpers/asyncToGenerator.js:14:12)
 ● Console
   console.log
     [33m08:28:04[39m [33m(growthbook)[39m GrowthBook initialization failed or timed out {
       "source": "error",
       "safeMessage": "Error: HTTP error: undefined"
     }
     at log (src/logger/transports/console.ts:67:13)
 ● MergeFeedAPI › sends platform and service geolocation only to Bluesky-owned merged sources
   expect(jest.fn()).toHaveBeenCalledWith(...expected)
   Expected: {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}}, ObjectContaining {"feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you"}, {"headers": {"Accept-Language": "", "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC", "x-atproto-bsky-geo-country": "JP", "x-atproto-bsky-geo-ip": "192.0.2.1", "x-atproto-bsky-geo-region": "13", "x-atproto-bsky-platform": "ios", "x-atproto-bsky-topics": "music"}}
   Received
          1
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:example:feed/app.bsky.feed.generator/test", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
             },
          2
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
             },
   Number of calls: 2
   [0m [90m 50 |[39m
    [90m 51 |[39m       expect(call)[33m.[39mtoHaveBeenCalledTimes([35m2[39m)
   [31m[1m>[22m[39m[90m 52 |[39m       expect(call)[33m.[39mtoHaveBeenCalledWith(
    [90m    |[39m                    [31m[1m^[22m[39m
    [90m 53 |[39m         app[33m.[39mbsky[33m.[39mfeed[33m.[39mgetFeed[33m,[39m
    [90m 54 |[39m         expect[33m.[39mobjectContaining({feed[33m:[39m [33mDISCOVER_FEED_URI[39m})[33m,[39m
    [90m 55 |[39m         {[0m
     at Object.toHaveBeenCalledWith (src/lib/api/feed/merge.test.ts:52:20)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (legacy) › gates platform and geolocation headers for authenticated fetches and peeks: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(jest.fn()).toHaveBeenNthCalledWith(n, ...expected)
   n: 1
   Expected: Anything, Anything, {"headers": {"Accept-Language": "", "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC", "x-atproto-bsky-geo-country": "JP", "x-atproto-bsky-geo-ip": "192.0.2.1", "x-atproto-bsky-geo-region": "13", "x-atproto-bsky-platform": "ios", "x-atproto-bsky-topics": "music"}, "signal": undefined}
   Received
   ->     1
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
               "signal": undefined,
             },
          2: {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}}, {"feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 1}, {"headers": {"Accept-Language": ""}}
   Number of calls: 2
   [0m [90m 61 |[39m         [32m'Accept-Language'[39m[33m:[39m [32m''[39m[33m,[39m
    [90m 62 |[39m       }
   [31m[1m>[22m[39m[90m 63 |[39m       expect(call)[33m.[39mtoHaveBeenNthCalledWith(
    [90m    |[39m                    [31m[1m^[22m[39m
    [90m 64 |[39m         [35m1[39m[33m,[39m
    [90m 65 |[39m         expect[33m.[39manything()[33m,[39m
    [90m 66 |[39m         expect[33m.[39manything()[33m,[39m[0m
     at toHaveBeenNthCalledWith (src/lib/api/feed/custom.test.ts:63:20)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (legacy) › preserves the cursor and gates feed headers on both logged-out attempts: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(received).toBe(expected) // Object.is equality
   Expected: "ios"
   Received: null
   [0m [90m 124 |[39m         [36mconst[39m headers [33m=[39m [36mnew[39m [33mHeaders[39m(init[33m?[39m[33m.[39mheaders)
    [90m 125 |[39m         [36mfor[39m ([36mconst[39m [key[33m,[39m value] [36mof[39m [33mObject[39m[33m.[39mentries(feedHeaders)) {
   [31m[1m>[22m[39m[90m 126 |[39m           expect(headers[33m.[39m[36mget[39m(key))[33m.[39mtoBe(
    [90m     |[39m                                    [31m[1m^[22m[39m
    [90m 127 |[39m             feed [33m===[39m [33mDISCOVER_FEED_URI[39m [33m?[39m value [33m:[39m [36mnull[39m[33m,[39m
    [90m 128 |[39m           )
    [90m 129 |[39m         }[0m
     at toBe (src/lib/api/feed/custom.test.ts:126:36)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (following v2) › gates platform and geolocation headers for authenticated fetches and peeks: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(jest.fn()).toHaveBeenNthCalledWith(n, ...expected)
   n: 1
   Expected: Anything, Anything, {"headers": {"Accept-Language": "", "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC", "x-atproto-bsky-geo-country": "JP", "x-atproto-bsky-geo-ip": "192.0.2.1", "x-atproto-bsky-geo-region": "13", "x-atproto-bsky-platform": "ios", "x-atproto-bsky-topics": "music"}, "signal": undefined}
   Received
   ->     1
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
               "signal": undefined,
             },
          2: {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}}, {"feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 1}, {"headers": {"Accept-Language": ""}}
   Number of calls: 2
   [0m [90m 61 |[39m         [32m'Accept-Language'[39m[33m:[39m [32m''[39m[33m,[39m
    [90m 62 |[39m       }
   [31m[1m>[22m[39m[90m 63 |[39m       expect(call)[33m.[39mtoHaveBeenNthCalledWith(
    [90m    |[39m                    [31m[1m^[22m[39m
    [90m 64 |[39m         [35m1[39m[33m,[39m
    [90m 65 |[39m         expect[33m.[39manything()[33m,[39m
    [90m 66 |[39m         expect[33m.[39manything()[33m,[39m[0m
     at toHaveBeenNthCalledWith (src/lib/api/feed/custom.test.ts:63:20)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (following v2) › preserves the cursor and gates feed headers on both logged-out attempts: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(received).toBe(expected) // Object.is equality
   Expected: "ios"
   Received: null
   [0m [90m 124 |[39m         [36mconst[39m headers [33m=[39m [36mnew[39m [33mHeaders[39m(init[33m?[39m[33m.[39mheaders)
    [90m 125 |[39m         [36mfor[39m ([36mconst[39m [key[33m,[39m value] [36mof[39m [33mObject[39m[33m.[39mentries(feedHeaders)) {
   [31m[1m>[22m[39m[90m 126 |[39m           expect(headers[33m.[39m[36mget[39m(key))[33m.[39mtoBe(
    [90m     |[39m                                    [31m[1m^[22m[39m
    [90m 127 |[39m             feed [33m===[39m [33mDISCOVER_FEED_URI[39m [33m?[39m value [33m:[39m [36mnull[39m[33m,[39m
    [90m 128 |[39m           )
    [90m 129 |[39m         }[0m
     at toBe (src/lib/api/feed/custom.test.ts:126:36)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● createBskyFeedHeaders › sends the web platform even without geolocation data
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "web",
   - }
   + Object {}
   [0m [90m 28 |[39m     platform [33m=>[39m {
    [90m 29 |[39m       jest[33m.[39mreplaceProperty([33mPlatform[39m[33m,[39m [32m'OS'[39m[33m,[39m platform)
   [31m[1m>[22m[39m[90m 30 |[39m       expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                        [31m[1m^[22m[39m
    [90m 31 |[39m         [32m'x-atproto-bsky-platform'[39m[33m:[39m platform[33m,[39m
    [90m 32 |[39m       })
    [90m 33 |[39m     }[33m,[39m[0m
     at toEqual (src/lib/api/feed/__tests__/utils.test.ts:30:56)
 ● createBskyFeedHeaders › sends the ios platform even without geolocation data
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "ios",
   - }
   + Object {}
   [0m [90m 28 |[39m     platform [33m=>[39m {
    [90m 29 |[39m       jest[33m.[39mreplaceProperty([33mPlatform[39m[33m,[39m [32m'OS'[39m[33m,[39m platform)
   [31m[1m>[22m[39m[90m 30 |[39m       expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                        [31m[1m^[22m[39m
    [90m 31 |[39m         [32m'x-atproto-bsky-platform'[39m[33m:[39m platform[33m,[39m
    [90m 32 |[39m       })
    [90m 33 |[39m     }[33m,[39m[0m
     at toEqual (src/lib/api/feed/__tests__/utils.test.ts:30:56)
 ● createBskyFeedHeaders › sends the android platform even without geolocation data
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "android",
   - }
   + Object {}
   [0m [90m 28 |[39m     platform [33m=>[39m {
    [90m 29 |[39m       jest[33m.[39mreplaceProperty([33mPlatform[39m[33m,[39m [32m'OS'[39m[33m,[39m platform)
   [31m[1m>[22m[39m[90m 30 |[39m       expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                        [31m[1m^[22m[39m
    [90m 31 |[39m         [32m'x-atproto-bsky-platform'[39m[33m:[39m platform[33m,[39m
    [90m 32 |[39m       })
    [90m 33 |[39m     }[33m,[39m[0m
     at toEqual (src/lib/api/feed/__tests__/utils.test.ts:30:56)
 ● createBskyFeedHeaders › omits missing values and reads updated service data on each request
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "ios",
   - }
   + Object {}
   [0m [90m 70 |[39m     [36mconst[39m [36mget[39m [33m=[39m jest[33m.[39mmocked(device[33m.[39m[36mget[39m)
    [90m 71 |[39m     [36mget[39m[33m.[39mmockReturnValueOnce(undefined)
   [31m[1m>[22m[39m[90m 72 |[39m     expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                      [31m[1m^[22m[39m
    [90m 73 |[39m       [32m'x-atproto-bsky-platform'[39m[33m:[39m [32m'ios'[39m[33m,[39m
    [90m 74 |[39m     })
    [90m 75 |[39m[0m
     at Object.toEqual (src/lib/api/feed/__tests__/utils.test.ts:72:54)
 ● MergeFeedAPI › sends platform and service geolocation only to Bluesky-owned merged sources
   expect(jest.fn()).toHaveBeenCalledWith(...expected)
   Expected: {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}}, ObjectContaining {"feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you"}, {"headers": {"Accept-Language": "", "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC", "x-atproto-bsky-geo-country": "JP", "x-atproto-bsky-geo-ip": "192.0.2.1", "x-atproto-bsky-geo-region": "13", "x-atproto-bsky-platform": "ios", "x-atproto-bsky-topics": "music"}}
   Received
          1
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:example:feed/app.bsky.feed.generator/test", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
             },
          2
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
             },
   Number of calls: 2
   [0m [90m 50 |[39m
    [90m 51 |[39m       expect(call)[33m.[39mtoHaveBeenCalledTimes([35m2[39m)
   [31m[1m>[22m[39m[90m 52 |[39m       expect(call)[33m.[39mtoHaveBeenCalledWith(
    [90m    |[39m                    [31m[1m^[22m[39m
    [90m 53 |[39m         app[33m.[39mbsky[33m.[39mfeed[33m.[39mgetFeed[33m,[39m
    [90m 54 |[39m         expect[33m.[39mobjectContaining({feed[33m:[39m [33mDISCOVER_FEED_URI[39m})[33m,[39m
    [90m 55 |[39m         {[0m
     at Object.toHaveBeenCalledWith (src/lib/api/feed/merge.test.ts:52:20)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (legacy) › gates platform and geolocation headers for authenticated fetches and peeks: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(jest.fn()).toHaveBeenNthCalledWith(n, ...expected)
   n: 1
   Expected: Anything, Anything, {"headers": {"Accept-Language": "", "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC", "x-atproto-bsky-geo-country": "JP", "x-atproto-bsky-geo-ip": "192.0.2.1", "x-atproto-bsky-geo-region": "13", "x-atproto-bsky-platform": "ios", "x-atproto-bsky-topics": "music"}, "signal": undefined}
   Received
   ->     1
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
               "signal": undefined,
             },
          2: {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}}, {"feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 1}, {"headers": {"Accept-Language": ""}}
   Number of calls: 2
   [0m [90m 61 |[39m         [32m'Accept-Language'[39m[33m:[39m [32m''[39m[33m,[39m
    [90m 62 |[39m       }
   [31m[1m>[22m[39m[90m 63 |[39m       expect(call)[33m.[39mtoHaveBeenNthCalledWith(
    [90m    |[39m                    [31m[1m^[22m[39m
    [90m 64 |[39m         [35m1[39m[33m,[39m
    [90m 65 |[39m         expect[33m.[39manything()[33m,[39m
    [90m 66 |[39m         expect[33m.[39manything()[33m,[39m[0m
     at toHaveBeenNthCalledWith (src/lib/api/feed/custom.test.ts:63:20)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (legacy) › preserves the cursor and gates feed headers on both logged-out attempts: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(received).toBe(expected) // Object.is equality
   Expected: "ios"
   Received: null
   [0m [90m 124 |[39m         [36mconst[39m headers [33m=[39m [36mnew[39m [33mHeaders[39m(init[33m?[39m[33m.[39mheaders)
    [90m 125 |[39m         [36mfor[39m ([36mconst[39m [key[33m,[39m value] [36mof[39m [33mObject[39m[33m.[39mentries(feedHeaders)) {
   [31m[1m>[22m[39m[90m 126 |[39m           expect(headers[33m.[39m[36mget[39m(key))[33m.[39mtoBe(
    [90m     |[39m                                    [31m[1m^[22m[39m
    [90m 127 |[39m             feed [33m===[39m [33mDISCOVER_FEED_URI[39m [33m?[39m value [33m:[39m [36mnull[39m[33m,[39m
    [90m 128 |[39m           )
    [90m 129 |[39m         }[0m
     at toBe (src/lib/api/feed/custom.test.ts:126:36)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (following v2) › gates platform and geolocation headers for authenticated fetches and peeks: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(jest.fn()).toHaveBeenNthCalledWith(n, ...expected)
   n: 1
   Expected: Anything, Anything, {"headers": {"Accept-Language": "", "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC", "x-atproto-bsky-geo-country": "JP", "x-atproto-bsky-geo-ip": "192.0.2.1", "x-atproto-bsky-geo-region": "13", "x-atproto-bsky-platform": "ios", "x-atproto-bsky-topics": "music"}, "signal": undefined}
   Received
   ->     1
             {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}},
             {"cursor": undefined, "feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 10},
             Object {
               "headers": Object {
                 "Accept-Language": "",
           -     "x-atproto-bsky-geo-city": "%E6%9D%B1%E4%BA%AC",
           -     "x-atproto-bsky-geo-country": "JP",
           -     "x-atproto-bsky-geo-ip": "192.0.2.1",
           -     "x-atproto-bsky-geo-region": "13",
           -     "x-atproto-bsky-platform": "ios",
           -     "x-atproto-bsky-topics": "music",
               },
               "signal": undefined,
             },
          2: {"$lxm": "app.bsky.feed.getFeed", "$nsid": "app.bsky.feed.getFeed", "$output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "$params": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "default": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}, "main": {"errors": ["UnknownFeed"], "nsid": "app.bsky.feed.getFeed", "output": {"encoding": "application/json", "schema": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {}, "type": "array", "validator": {"type": "ref"}}}, "type": "object"}}, "parameters": {"shape": {"cursor": {"type": "optional", "validator": {"options": {}, "type": "string"}}, "feed": {"options": {"format": "at-uri"}, "type": "string"}, "limit": {"type": "optional", "validator": {"defaultValue": 50, "type": "withDefault", "validator": {"options": {"maximum": 100, "minimum": 1}, "type": "integer"}}}}, "type": "params"}, "type": "query"}}, {"feed": "at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you", "limit": 1}, {"headers": {"Accept-Language": ""}}
   Number of calls: 2
   [0m [90m 61 |[39m         [32m'Accept-Language'[39m[33m:[39m [32m''[39m[33m,[39m
    [90m 62 |[39m       }
   [31m[1m>[22m[39m[90m 63 |[39m       expect(call)[33m.[39mtoHaveBeenNthCalledWith(
    [90m    |[39m                    [31m[1m^[22m[39m
    [90m 64 |[39m         [35m1[39m[33m,[39m
    [90m 65 |[39m         expect[33m.[39manything()[33m,[39m
    [90m 66 |[39m         expect[33m.[39manything()[33m,[39m[0m
     at toHaveBeenNthCalledWith (src/lib/api/feed/custom.test.ts:63:20)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● CustomFeedAPI (following v2) › preserves the cursor and gates feed headers on both logged-out attempts: at://did:plc:i3vxbku5ruonxwcevi3urzt3/app.bsky.feed.generator/for-you
   expect(received).toBe(expected) // Object.is equality
   Expected: "ios"
   Received: null
   [0m [90m 124 |[39m         [36mconst[39m headers [33m=[39m [36mnew[39m [33mHeaders[39m(init[33m?[39m[33m.[39mheaders)
    [90m 125 |[39m         [36mfor[39m ([36mconst[39m [key[33m,[39m value] [36mof[39m [33mObject[39m[33m.[39mentries(feedHeaders)) {
   [31m[1m>[22m[39m[90m 126 |[39m           expect(headers[33m.[39m[36mget[39m(key))[33m.[39mtoBe(
    [90m     |[39m                                    [31m[1m^[22m[39m
    [90m 127 |[39m             feed [33m===[39m [33mDISCOVER_FEED_URI[39m [33m?[39m value [33m:[39m [36mnull[39m[33m,[39m
    [90m 128 |[39m           )
    [90m 129 |[39m         }[0m
     at toBe (src/lib/api/feed/custom.test.ts:126:36)
     at asyncGeneratorStep (node_modules/@babel/runtime/helpers/asyncToGenerator.js:3:17)
     at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)
 ● createBskyFeedHeaders › sends the web platform even without geolocation data
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "web",
   - }
   + Object {}
   [0m [90m 28 |[39m     platform [33m=>[39m {
    [90m 29 |[39m       jest[33m.[39mreplaceProperty([33mPlatform[39m[33m,[39m [32m'OS'[39m[33m,[39m platform)
   [31m[1m>[22m[39m[90m 30 |[39m       expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                        [31m[1m^[22m[39m
    [90m 31 |[39m         [32m'x-atproto-bsky-platform'[39m[33m:[39m platform[33m,[39m
    [90m 32 |[39m       })
    [90m 33 |[39m     }[33m,[39m[0m
     at toEqual (src/lib/api/feed/__tests__/utils.test.ts:30:56)
 ● createBskyFeedHeaders › sends the ios platform even without geolocation data
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "ios",
   - }
   + Object {}
   [0m [90m 28 |[39m     platform [33m=>[39m {
    [90m 29 |[39m       jest[33m.[39mreplaceProperty([33mPlatform[39m[33m,[39m [32m'OS'[39m[33m,[39m platform)
   [31m[1m>[22m[39m[90m 30 |[39m       expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                        [31m[1m^[22m[39m
    [90m 31 |[39m         [32m'x-atproto-bsky-platform'[39m[33m:[39m platform[33m,[39m
    [90m 32 |[39m       })
    [90m 33 |[39m     }[33m,[39m[0m
     at toEqual (src/lib/api/feed/__tests__/utils.test.ts:30:56)
 ● createBskyFeedHeaders › sends the android platform even without geolocation data
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "android",
   - }
   + Object {}
   [0m [90m 28 |[39m     platform [33m=>[39m {
    [90m 29 |[39m       jest[33m.[39mreplaceProperty([33mPlatform[39m[33m,[39m [32m'OS'[39m[33m,[39m platform)
   [31m[1m>[22m[39m[90m 30 |[39m       expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                        [31m[1m^[22m[39m
    [90m 31 |[39m         [32m'x-atproto-bsky-platform'[39m[33m:[39m platform[33m,[39m
    [90m 32 |[39m       })
    [90m 33 |[39m     }[33m,[39m[0m
     at toEqual (src/lib/api/feed/__tests__/utils.test.ts:30:56)
 ● createBskyFeedHeaders › omits missing values and reads updated service data on each request
   expect(received).toEqual(expected) // deep equality
   - Expected  - 3
   + Received  + 1
   - Object {
   -   "x-atproto-bsky-platform": "ios",
   - }
   + Object {}
   [0m [90m 70 |[39m     [36mconst[39m [36mget[39m [33m=[39m jest[33m.[39mmocked(device[33m.[39m[36mget[39m)
    [90m 71 |[39m     [36mget[39m[33m.[39mmockReturnValueOnce(undefined)
   [31m[1m>[22m[39m[90m 72 |[39m     expect(createBskyFeedHeaders([33mDISCOVER_FEED_URI[39m))[33m.[39mtoEqual({
    [90m    |[39m                                                      [31m[1m^[22m[39m
    [90m 73 |[39m       [32m'x-atproto-bsky-platform'[39m[33m:[39m [32m'ios'[39m[33m,[39m
    [90m 74 |[39m     })
    [90m 75 |[39m[0m
     at Object.toEqual (src/lib/api/feed/__tests__/utils.test.ts:72:54)
 PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
 PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
 PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
 fill,
 ...rest
 const pal = usePalette('default')
 // @ts-expect-error react-native-svg accepts numeric strings here
 const size = parseInt(rest.width || 32)
 return (
   <Svg fill="none" viewBox="0 0 64 64" {...rest} width={size} height={size}>
     <Path
       fill={fill || pal.text.color}
       d="M10 54V10h11l11 16 11-16h11v44H42V30L32 44 22 30v24Z"
     />
   </Svg>
 )
 PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
 LINT_RESULT: success
 PRETTIER_RESULT: failure
 TEST_RESULT: failure
 ANDROID_RESULT: success
 WEB_RESULT: success
 PNPM_HOME: /home/runner/setup-pnpm/node_modules/.bin
