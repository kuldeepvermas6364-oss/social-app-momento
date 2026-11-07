import {useMemo, useState} from 'react'
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
import {launchImageLibraryAsync} from 'expo-image-picker'
import {createVideoPlayer, VideoView} from 'expo-video'

import {getStoryMediaType, type StoryView} from '#/lib/stories/api'
import {
  useCreateStoryMutation,
  useDeleteStoryMutation,
  useStoriesQuery,
} from '#/state/queries/stories'
import {useProfilesQuery} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import * as Layout from '#/components/Layout'

const MAX_STORY_BYTES = 100_000_000

export function StoriesScreen() {
  const {currentAccount} = useSession()
  const storiesQuery = useStoriesQuery()
  const createMutation = useCreateStoryMutation()
  const deleteMutation = useDeleteStoryMutation()
  const [caption, setCaption] = useState('')
  const [selectedStory, setSelectedStory] = useState<StoryView | undefined>()

  const stories = storiesQuery.data ?? []
  const authorDids = useMemo(
    () => [...new Set(stories.map(story => story.authorDid))],
    [stories],
  )
  const profilesQuery = useProfilesQuery({
    handles: authorDids,
    maintainData: true,
  })
  const profiles = profilesQuery.data?.profiles ?? []
  const profileByDid = useMemo(
    () => new Map(profiles.map(profile => [profile.did, profile])),
    [profiles],
  )

  const onAddStory = async () => {
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
      if (asset.fileSize && asset.fileSize > MAX_STORY_BYTES) {
        throw new Error('Story media must be 100 MB or smaller.')
      }

      await createMutation.mutateAsync({
        asset: {path: asset.uri, mime},
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
          <RNText style={{fontSize: 25, fontWeight: '700'}}>Momento Stories</RNText>
          <RNText style={{fontSize: 13, color: '#777'}}>
            Public stories from people you follow. Stories expire after 24 hours.
          </RNText>
        </View>

        <TextInput
          value={caption}
          onChangeText={value => setCaption(value.slice(0, 300))}
          placeholder="Add a short caption (optional)"
          maxLength={300}
          style={{
            borderWidth: 1,
            borderColor: '#8885',
            borderRadius: 12,
            padding: 12,
            color: 'inherit',
          }}
        />

        <Pressable
          accessibilityRole="button"
          disabled={createMutation.isPending}
          onPress={onAddStory}
          style={{
            backgroundColor: '#6652d9',
            borderRadius: 12,
            padding: 14,
            alignItems: 'center',
            opacity: createMutation.isPending ? 0.6 : 1,
          }}>
          <RNText style={{color: 'white', fontWeight: '700'}}>
            {createMutation.isPending ? 'Uploading story…' : '+ Add a story'}
          </RNText>
        </Pressable>

        {storiesQuery.isLoading ? (
          <ActivityIndicator size="large" />
        ) : storiesQuery.isError ? (
          <View style={{gap: 8}}>
            <RNText>Stories could not be loaded.</RNText>
            <Pressable onPress={() => void storiesQuery.refetch()}>
              <RNText style={{color: '#6652d9', fontWeight: '600'}}>Try again</RNText>
            </Pressable>
          </View>
        ) : stories.length === 0 ? (
          <RNText style={{color: '#777'}}>
            No active stories yet. Share the first one.
          </RNText>
        ) : (
          <View style={{gap: 12}}>
            <RNText style={{fontSize: 18, fontWeight: '700'}}>Recent stories</RNText>
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
                      onPress={() => setSelectedStory(story)}
                      style={{width: 124, gap: 6}}>
                      {story.record.mediaType === 'image' ? (
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
                          <RNText style={{color: 'white', fontSize: 16}}>▶ VIDEO</RNText>
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
            {selectedStory.record.mediaType === 'image' ? (
              <Image
                source={{uri: selectedStory.mediaUrl}}
                contentFit="contain"
                style={{flex: 1}}
              />
            ) : (
              <StoryVideo story={selectedStory} />
            )}
            {selectedStory.record.caption ? (
              <RNText
                style={{
                  color: 'white',
                  textAlign: 'center',
                  padding: 16,
                  fontSize: 16,
                }}>
                {selectedStory.record.caption}
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
              <Pressable onPress={() => setSelectedStory(undefined)}>
                <RNText style={{color: 'white', fontSize: 18}}>Close ✕</RNText>
              </Pressable>
              {selectedStory.authorDid === currentAccount?.did ? (
                <Pressable
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

function StoryVideo({story}: {story: StoryView}) {
  const player = useMemo(() => createVideoPlayer(story.mediaUrl), [story.mediaUrl])
  useMemo(() => {
    player.loop = true
    player.play()
    return player
  }, [player])

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{flex: 1}}
    />
  )
}
