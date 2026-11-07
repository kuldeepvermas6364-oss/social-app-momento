import {type Client} from '@atproto/lex'

import {uploadBlob} from '#/lib/api/upload-blob'
import {createServiceClient} from '#/state/session/clients'
import {app, com} from '#/lexicons'
import {isStoryActive, getStoryExpiresAt} from './expiry'

export type StoryMediaType = 'image' | 'video'

export type StoryAsset = {
  path: string
  mime: string
}

export type CreateStoryOptions = {
  pdsClient: Client
  asset: StoryAsset
  caption?: string
  altText?: string
  createdAt?: Date
}

/** Maps only media formats supported by the Momento story lexicon. */
export function getStoryMediaType(mime: string): StoryMediaType {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'video/mp4') return 'video'
  throw new TypeError('Stories support images and MP4 videos only')
}

/**
 * Uploads story media to the author's PDS and writes an AT Protocol record.
 * Story records are public; expiry is enforced by clients at 24 hours.
 */
export async function createStory({
  pdsClient,
  asset,
  caption,
  altText,
  createdAt = new Date(),
}: CreateStoryOptions) {
  const mediaType = getStoryMediaType(asset.mime)
  if (!asset.path) {
    throw new TypeError('Story media path is required')
  }

  const createdAtIso = createdAt.toISOString()
  const {blob} = await uploadBlob(pdsClient, asset.path, asset.mime)
  const record: app.momento.story.Main = {
    $type: 'app.momento.story',
    media: blob,
    mediaType,
    createdAt: createdAtIso,
    expiresAt: getStoryExpiresAt(createdAtIso),
    caption: caption?.trim().slice(0, 300) || undefined,
    altText: altText?.trim().slice(0, 1000) || undefined,
  }

  return await pdsClient.call(com.atproto.repo.createRecord, {
    repo: pdsClient.assertDid,
    collection: 'app.momento.story',
    record,
  })
}

/** Deletes one of the signed-in author's story records from their PDS. */
export async function deleteStory(
  pdsClient: Client,
  rkey: string,
): Promise<void> {
  if (!rkey) {
    throw new TypeError('Story record key is required')
  }

  await pdsClient.call(com.atproto.repo.deleteRecord, {
    repo: pdsClient.assertDid,
    collection: 'app.momento.story',
    rkey,
  })
}

export type StoryView = {
  uri: string
  cid: string
  authorDid: string
  record: app.momento.story.Main
  mediaUrl: string
}

/** Extracts the author's public PDS endpoint from a resolved DID document. */
export function getPdsEndpoint(didDoc: unknown): string | undefined {
  if (!didDoc || typeof didDoc !== 'object') return undefined
  const services = (didDoc as {service?: unknown}).service
  if (!Array.isArray(services)) return undefined

  const service = services.find(
    item =>
      item &&
      typeof item === 'object' &&
      (item as {type?: unknown}).type === 'AtprotoPersonalDataServer' &&
      typeof (item as {serviceEndpoint?: unknown}).serviceEndpoint === 'string',
  ) as {serviceEndpoint: string} | undefined

  if (!service) return undefined

  try {
    const endpoint = new URL(service.serviceEndpoint)
    if (endpoint.protocol !== 'https:') return undefined
    return endpoint.origin
  } catch {
    return undefined
  }
}

function isStoryRecord(value: unknown): value is app.momento.story.Main {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<app.momento.story.Main>
  return (
    record.$type === 'app.momento.story' &&
    (record.mediaType === 'image' || record.mediaType === 'video') &&
    typeof record.createdAt === 'string' &&
    typeof record.expiresAt === 'string' &&
    !!record.media
  )
}

/**
 * Reads public stories from followed accounts' PDS repositories. AT Protocol
 * has no global AppView index for this custom collection, so each author's PDS
 * is resolved from their DID document and queried directly.
 */
export async function listStoriesForAuthors(
  appviewClient: Client,
  authorDids: string[],
  now: number = Date.now(),
): Promise<StoryView[]> {
  const uniqueDids = [...new Set(authorDids)].slice(0, 30)
  const results = await Promise.all(
    uniqueDids.map(async authorDid => {
      try {
        const identity = await appviewClient.call(
          com.atproto.identity.resolveIdentity,
          {identifier: authorDid},
        )
        const pdsEndpoint = getPdsEndpoint(identity.didDoc)
        if (!pdsEndpoint) return []

        const pdsClient = createServiceClient(pdsEndpoint)
        const response = await pdsClient.call(com.atproto.repo.listRecords, {
          repo: authorDid,
          collection: 'app.momento.story',
          limit: 100,
          reverse: true,
        })

        return response.records.flatMap(record => {
          if (!isStoryRecord(record.value)) return []
          if (!isStoryActive(record.value, now)) return []
          const media = record.value.media as unknown as {
            ref?: {toString: () => string}
            cid?: string
          }
          const cid = media.ref?.toString() ?? media.cid
          if (!cid) return []
          const mediaUrl = new URL('/xrpc/com.atproto.sync.getBlob', pdsEndpoint)
          mediaUrl.searchParams.set('did', authorDid)
          mediaUrl.searchParams.set('cid', cid)
          return [{
            uri: record.uri,
            cid: record.cid,
            authorDid,
            record: record.value,
            mediaUrl: mediaUrl.toString(),
          }]
        })
      } catch {
        // An unavailable or unsupported PDS must not prevent other authors'
        // stories from loading.
        return []
      }
    }),
  )

  return results.flat().sort(
    (a, b) => Date.parse(a.record.createdAt) - Date.parse(b.record.createdAt),
  )
}
