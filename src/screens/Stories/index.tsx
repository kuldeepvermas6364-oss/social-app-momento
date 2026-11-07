import {useState} from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
} from 'react-native'
import {Image} from 'expo-image'
import {type ImagePickerAsset, launchImageLibraryAsync} from 'expo-image-picker'
import {type BlobRef, type Client} from '@atproto/lex'
import {type I18n} from '@lingui/core'
import {useLingui} from '@lingui/react'

import {IMAGE_SIZE_CONFIG_POSTS} from '#/lib/constants'
import {createVideoTelemetry} from '#/lib/media/video/telemetry'
import {
  getStoryMediaType,
  type StoryAsset,
  type StoryView,
} from '#/lib/stories/api'
import {compressImage, createComposerImage} from '#/state/gallery'
import {useProfilesQuery} from '#/state/queries/profile'
import {
  useCreateStoryMutation,
  useDeleteStoryMutation,
  useStoriesQuery,
} from '#/state/queries/stories'
import {usePdsClient, useSession} from '#/state/session'
import {processVideo} from '#/view/com/composer/state/video'
import * as Layout from '#/components/Layout'
import {useAnalytics} from '#/analytics'
import {type Metrics} from '#/analytics/metrics'
import {StoryVideo} from './StoryVideo'

const MAX_VIDEO_BYTES = 100_000_000
const EMPTY_STORIES: StoryView[] = []

type MetricFn = <E extends keyof Metrics>(event: E, payload: Metrics[E]) => void

export function StoriesScreen() {
  const {currentAccount} = useSession()
  const pdsClient = usePdsClient()
  const ax = useAnalytics()
  const {i18n} = useLingui()
  const storiesQuery = useStoriesQuery()
  const createMutation = useCreateStoryMutation()
  const deleteMutation = useDeleteStoryMutation()
  const [caption, setCaption] = useState('')
  const [isPreparing, setIsPreparing] = useState(false)
  const [selectedStory, setSelectedStory] = useState<StoryView | undefined>()

  const stories = storiesQuery.data ?? EMPTY_STORIES
  const authorDids = [...new Set(stories.map(story => story.authorDid))]
  const profilesQuery = useProfilesQuery({
    handles: authorDids,
    maintainData: true,
  })
  const profileByDid = new Map(
    (profilesQuery.data?.profiles ?? []).map(profile => [profile.did, profile]),
  )

  const onAddStory = async () => {
    setIsPreparing(true)
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        selectionLimit: 1,
        quality: 0.9,
        videoMaxDuration: 60,
        exif: false,
      })
      if (result.canceled || !result.assets[0]) return

      const asset = result.assets[0]
      const mime =
        asset.mimeType ??
        (asset.uri.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'image/jpeg')
      const mediaType = getStoryMediaType(mime)
      if (
        asset.fileSize &&
        mediaType === 'video' &&
        asset.fileSize > MAX_VIDEO_BYTES
      ) {
        throw new Error('Videos must be 100 MB or smaller.')
      }

      let storyAsset: StoryAsset = {path: asset.uri, mime}
      if (mediaType === 'image') {
        const image = await createComposerImage({
          path: asset.uri,
          width: asset.width,
          height: asset.height,
          mime,
        })
        const compressed = await compressImage(image, IMAGE_SIZE_CONFIG_POSTS)
        storyAsset = {path: compressed.path, mime: compressed.mime}
      } else {
        if (!currentAccount?.pdsUrl) {
          throw new Error('Your account PDS is unavailable for video upload.')
        }
        const blob = await uploadStoryVideo(
          asset,
          pdsClient,
          currentAccount.pdsUrl,
          i18n,
          (event, payload) => ax.metric(event, payload),
        )
        storyAsset = {path: asset.uri, mime, blob}
      }

      await createMutation.mutateAsync({
        asset: storyAsset,
        caption: caption.trim(),
        altText: mediaType === 'image' ? caption.trim() : undefined,
      })
      setCaption('')
      Alert.alert('Story posted', 'Your story will be available for 24 hours.')
    } catch (error) {
      Alert.alert(
        'Could not post story',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setIsPreparing(false)
    }
  }

  const onDeleteStory = async (story: StoryView) => {
    try {
      await deleteMutation.mutateAsync(story.uri)
      setSelectedStory(undefined)
    } catch (error) {
      Alert.alert(
        'Could not delete story',
        error instanceof Error ? error.message : 'Please try again.',
      )
    }
  }

  return (
    <Layout.Screen>
      <ScrollView contentContainerStyle={{padding: 16, gap: 16}}>
        <View style={{gap: 6}}>
          <RNText style={{fontSize: 25, fontWeight: '700'}}>
            Momento Stories
          </RNText>
          <RNText style={{fontSize: 13, color: '#777'}}>
            Public stories from people you follow. Stories expire after 24
            hours.
          </RNText>
        </View>

        <TextInput
          accessibilityLabel="Story caption"
          accessibilityHint="Optional caption for your story"
          value={caption}
          onChangeText={value => setCaption(value.slice(0, 300))}
          placeholder="Add a short caption (optional)"
          maxLength={300}
          style={{
            borderWidth: 1,
            borderColor: '#8885',
            borderRadius: 12,
            padding: 12,
            color: '#171717',
          }}
        />

        <Pressable
          accessibilityRole="button"
          disabled={isPreparing || createMutation.isPending}
          onPress={onAddStory}
          style={{
            backgroundColor: '#6652d9',
            borderRadius: 12,
            padding: 14,
            alignItems: 'center',
            opacity: isPreparing || createMutation.isPending ? 0.6 : 1,
          }}>
          <RNText style={{color: 'white', fontWeight: '700'}}>
            {isPreparing
              ? 'Preparing story…'
              : createMutation.isPending
                ? 'Publishing story…'
                : '+ Add a story'}
          </RNText>
        </Pressable>

        {storiesQuery.isLoading ? (
          <ActivityIndicator size="large" />
        ) : storiesQuery.isError ? (
          <View style={{gap: 8}}>
            <RNText>Stories could not be loaded.</RNText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void storiesQuery.refetch()}>
              <RNText style={{color: '#6652d9', fontWeight: '600'}}>
                Try again
              </RNText>
            </Pressable>
          </View>
        ) : stories.length === 0 ? (
          <RNText style={{color: '#777'}}>
            No active stories yet. Share the first one.
          </RNText>
        ) : (
          <View style={{gap: 12}}>
            <RNText style={{fontSize: 18, fontWeight: '700'}}>
              Recent stories
            </RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{flexDirection: 'row', gap: 12}}>
                {stories.map(story => {
                  const profile = profileByDid.get(story.authorDid)
                  const label =
                    profile?.displayName || profile?.handle || story.authorDid
                  const isOwnStory = story.authorDid === currentAccount?.did
                  return (
                    <Pressable
                      key={story.uri}
                      accessibilityRole="button"
                      accessibilityLabel={`Open story by ${label}`}
                      accessibilityHint="Opens this story"
                      onPress={() => setSelectedStory(story)}
                      style={{width: 124, gap: 6}}>
                      {story.mediaType === 'image' ? (
                        <Image
                          source={{uri: story.mediaUrl}}
                          contentFit="cover"
                          style={{
                            width: 124,
                            height: 176,
                            borderRadius: 14,
                            backgroundColor: '#222',
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 124,
                            height: 176,
                            borderRadius: 14,
                            backgroundColor: '#20202a',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                          {story.thumbnailUrl ? (
                            <Image
                              source={{uri: story.thumbnailUrl}}
                              contentFit="cover"
                              style={{
                                width: 124,
                                height: 176,
                                borderRadius: 14,
                              }}
                            />
                          ) : (
                            <RNText style={{color: 'white', fontSize: 16}}>
                              ▶ VIDEO
                            </RNText>
                          )}
                        </View>
                      )}
                      <RNText numberOfLines={1} style={{fontWeight: '600'}}>
                        {isOwnStory ? 'Your story' : label}
                      </RNText>
                    </Pressable>
                  )
                })}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!selectedStory}
        animationType="fade"
        onRequestClose={() => setSelectedStory(undefined)}
        statusBarTranslucent>
        {selectedStory ? (
          <View style={{flex: 1, backgroundColor: 'black'}}>
            {selectedStory.mediaType === 'image' ? (
              <Image
                source={{uri: selectedStory.mediaUrl}}
                contentFit="contain"
                style={{flex: 1}}
              />
            ) : (
              <StoryVideo story={selectedStory} />
            )}
            {selectedStory.record.text ? (
              <RNText
                style={{
                  color: 'white',
                  textAlign: 'center',
                  padding: 16,
                  fontSize: 16,
                }}>
                {selectedStory.record.text}
              </RNText>
            ) : null}
            <View
              style={{
                position: 'absolute',
                top: 48,
                left: 16,
                right: 16,
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelectedStory(undefined)}>
                <RNText style={{color: 'white', fontSize: 18}}>Close ✕</RNText>
              </Pressable>
              {selectedStory.authorDid === currentAccount?.did ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={deleteMutation.isPending}
                  onPress={() => void onDeleteStory(selectedStory)}>
                  <RNText style={{color: 'white', fontSize: 16}}>
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                  </RNText>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </Modal>
    </Layout.Screen>
  )
}

async function uploadStoryVideo(
  asset: ImagePickerAsset,
  pdsClient: Client,
  dispatchUrl: string,
  i18n: I18n,
  metric: MetricFn,
): Promise<BlobRef> {
  const controller = new AbortController()
  const telemetry = createVideoTelemetry({
    asset,
    signal: controller.signal,
    metric,
  })
  telemetry.picked()

  return await new Promise((resolve, reject) => {
    void processVideo(
      asset,
      action => {
        if (action.type === 'to_done') {
          telemetry.published()
          resolve(action.blobRef)
        } else if (action.type === 'to_error') {
          reject(new Error(action.error))
        }
      },
      pdsClient,
      dispatchUrl,
      controller.signal,
      i18n,
      telemetry,
    ).catch(reject)
  })
}
