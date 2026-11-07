import {type Client} from '@atproto/lex'
import {
  type AtIdentifierString,
  AtUri,
  toDatetimeString,
} from '@atproto/syntax'

import {uploadBlob} from '#/lib/api/upload-blob'
import {app, com} from '#/lexicons'
import {getStoryExpiresAt, isStoryActive} from './expiry'

export const MOMENTO_STORY_TAG = 'momento-story'

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

export type StoryView = {
  uri: string
  cid: string
  authorDid: string
  record: app.bsky.feed.post.Main
  mediaType: StoryMediaType
  mediaUrl: string
}

/** Maps only media formats supported by the standard AT Protocol embeds. */
export function getStoryMediaType(mime: string): StoryMediaType {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'video/mp4') return 'video'
  throw new TypeError('Stories support images and MP4 videos only')
}

/**
 * Stories use standard app.bsky.feed.post records and media embeds so normal
 * AT Protocol PDS and AppView infrastructure can store and index them. The
 * Momento tag distinguishes story posts from ordinary feed posts.
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

  const {blob} = await uploadBlob(pdsClient, asset.path, asset.mime)
  const embed: app.bsky.feed.post.Main['embed'] =
    mediaType === 'image'
      ? {
          $type: 'app.bsky.embed.images',
          images: [
            {
              alt: altText?.trim().slice(0, 1000) || caption?.trim() || '',
              image: blob,
            },
          ],
        }
      : {
          $type: 'app.bsky.embed.video',
          video: blob,
          alt: altText?.trim().slice(0, 1000) || caption?.trim() || undefined,
        }

  const record: app.bsky.feed.post.Main = {
    $type: 'app.bsky.feed.post',
    text: caption?.trim().slice(0, 300) || '',
    createdAt: toDatetimeString(createdAt),
    tags: [MOMENTO_STORY_TAG],
    embed,
  }

  return await pdsClient.call(com.atproto.repo.createRecord, {
    repo: pdsClient.assertDid,
    collection: 'app.bsky.feed.post',
    record,
  })
}

/** Deletes a Momento story post from the signed-in author's repository. */
export async function deleteStory(
  pdsClient: Client,
  uri: string,
): Promise<void> {
  const atUri = new AtUri(uri)
  if (atUri.collection !== 'app.bsky.feed.post' || !atUri.rkey) {
    throw new TypeError('Invalid Momento story URI')
  }

  await pdsClient.call(com.atproto.repo.deleteRecord, {
    repo: pdsClient.assertDid,
    collection: 'app.bsky.feed.post',
    rkey: atUri.rkey,
  })
}

type StoryEmbedView = {
  $type?: string
  images?: {fullsize?: string}[]
  playlist?: string
  thumbnail?: string
}

/**
 * Loads a user's recent public feed and selects only Momento-tagged media
 * posts. The 24-hour expiry is derived from the standard createdAt timestamp,
 * avoiding a custom lexicon or a Momento-specific backend.
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
        const response = await appviewClient.call(
          app.bsky.feed.getAuthorFeed,
          {
            actor: authorDid as AtIdentifierString,
            filter: 'posts_no_replies',
            limit: 100,
          },
        )

        return response.feed.flatMap(item => {
          const record = item.post.record as app.bsky.feed.post.Main
          if (!record.tags?.includes(MOMENTO_STORY_TAG)) return []
          if (
            !isStoryActive(
              {
                createdAt: record.createdAt,
                expiresAt: getStoryExpiresAt(record.createdAt),
              },
              now,
            )
          ) {
            return []
          }

          const embed = item.post.embed as StoryEmbedView | undefined
          if (!embed) return []

          if (
            embed.$type === 'app.bsky.embed.images#view' &&
            embed.images?.[0]?.fullsize
          ) {
            return [
              {
                uri: item.post.uri,
                cid: item.post.cid,
                authorDid,
                record,
                mediaType: 'image' as const,
                mediaUrl: embed.images[0].fullsize,
              },
            ]
          }

          if (
            embed.$type === 'app.bsky.embed.video#view' &&
            embed.playlist
          ) {
            return [
              {
                uri: item.post.uri,
                cid: item.post.cid,
                authorDid,
                record,
                mediaType: 'video' as const,
                mediaUrl: embed.playlist,
              },
            ]
          }

          return []
        })
      } catch {
        // An unavailable account or AppView must not block other stories.
        return []
      }
    }),
  )

  return results
    .flat()
    .sort(
      (a, b) =>
        Date.parse(a.record.createdAt) - Date.parse(b.record.createdAt),
    )
}
