# Momento Feed Generator

An AT Protocol Feed Generator service for Momento's public For You feed.

## Endpoints

- `GET /.well-known/did.json` — DID document for the feed service.
- `GET /xrpc/app.bsky.feed.describeFeedGenerator` — advertises the For You feed.
- `GET /xrpc/app.bsky.feed.getFeedSkeleton?feed=at://<feed-did>/app.bsky.feed.generator/for-you&limit=30` — returns ranked post URIs.

## Ranking

The worker fetches public candidates from the Bluesky AppView, deduplicates them,
excludes records tagged `momento-story`, then ranks by freshness, likes, reposts,
replies, and media presence. Candidate results are cached in the Worker isolate
for 90 seconds. The worker does not store user data or require API keys.

## Publish the feed record

After deployment, publish an `app.bsky.feed.generator` record with rkey
`for-you` from the account DID that owns the feed. Set its `did` field to the
Worker's `did:web` DID. Set `displayName` to `Momento For You` and include a
short description. The feed is not discoverable in clients until that record is
published and the service DID is resolvable.

## Deploy

```sh
cd feed-generator
npx wrangler deploy
```
