import {type Client} from '@atproto/lex'

import {uploadBlob} from '#/lib/api/upload-blob'
import {app, com} from '#/lexicons'
import {getStoryExpiresAt} from './expiry'

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
    validate: true,
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
