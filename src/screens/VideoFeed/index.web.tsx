import {createElement, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {FlatList, Pressable, View, useWindowDimensions} from 'react-native'
import {useIsFocused, useNavigation, useRoute, type RouteProp} from '@react-navigation/native'

import {type CommonNavigatorParams, type NavigationProp} from '#/lib/routes/types'
import {POST_TOMBSTONE, usePostShadow} from '#/state/cache/post-shadow'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {usePostLikeMutationQueue} from '#/state/queries/post'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {useProfileFollowMutationQueue} from '#/state/queries/profile'
import {useSession} from '#/state/session'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {Text} from '#/components/Typography'

type VideoPost = {
  key: string
  post: app.bsky.feed.defs.PostView
  playlist: string
}

export function VideoFeed() {
  const route = useRoute<RouteProp<CommonNavigatorParams, 'VideoFeed'>>()
  const navigation = useNavigation<NavigationProp>()
  const isFocused = useIsFocused()
  const {height} = useWindowDimensions()
  const {params} = route

  const feedDesc = useMemo(() => {
    if (params.type === 'feedgen') return `feedgen|${params.uri}` as const
    return `author|${params.did}|${params.filter}` as const
  }, [params])

  const feedParams =
    params.type === 'feedgen' && params.sourceInterstitial !== 'none'
      ? {feedCacheKey: params.sourceInterstitial}
      : undefined

  const {data, error, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage} =
    usePostFeedQuery(feedDesc, feedParams)

  const videos = useMemo<VideoPost[]>(() => {
    const posts: VideoPost[] = []
    for (const page of data?.pages ?? []) {
      for (const slice of page.slices) {
        const item = slice.items.find(candidate => candidate.uri === slice.feedPostUri)
        const embed = item?.post.embed
        if (item && embed && bsky.isType(app.bsky.embed.video.view, embed)) {
          posts.push({key: item._reactKey, post: item.post, playlist: embed.playlist})
        }
      }
    }
    const initialIndex = posts.findIndex(item => item.post.uri === params.initialPostUri)
    return initialIndex > 0 ? posts.slice(initialIndex) : posts
  }, [data, params.initialPostUri])

  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)

  const renderItem = useCallback(({item, index}: {item: VideoPost; index: number}) => (
    <VideoCard
      item={item}
      height={height}
      active={isFocused && index === activeIndex}
      muted={muted}
      onToggleMute={() => setMuted(value => !value)}
      onOpenAuthor={() => navigation.navigate('Profile', {name: item.post.author.handle})}
      onOpenPost={() => {
        const uri = item.post.uri.split('/')
        navigation.navigate('PostThread', {
          name: uri[2] ?? item.post.author.handle,
          rkey: uri[4] ?? '',
        })
      }}
    />
  ), [activeIndex, height, isFocused, muted, navigation])

  if (isLoading) {
    return <StatusMessage message="Loading videos…" />
  }

  if (error) {
    return <StatusMessage message="Videos could not be loaded. Check your connection and try again." />
  }

  if (!videos.length) {
    return <StatusMessage message="No videos in this feed yet." />
  }

  return (
    <View style={{flex: 1, backgroundColor: '#08080b'}}>
      <FlatList
        data={videos}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        pagingEnabled
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={event => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.y / Math.max(height, 1))
          setActiveIndex(Math.max(0, Math.min(nextIndex, videos.length - 1)))
          if (hasNextPage && nextIndex >= videos.length - 2 && !isFetchingNextPage) {
            void fetchNextPage()
          }
        }}
        getItemLayout={(_, index) => ({length: height, offset: height * index, index})}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
        }}
        onEndReachedThreshold={1}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{height: 64, alignItems: 'center', justifyContent: 'center'}}>
              <Text style={{color: 'white'}}>Loading more…</Text>
            </View>
          ) : null
        }
      />
    </View>
  )
}

function StatusMessage({message}: {message: string}) {
  return (
    <View style={{flex: 1, backgroundColor: '#08080b', alignItems: 'center', justifyContent: 'center', padding: 24}}>
      <Text style={{color: 'white', textAlign: 'center'}}>{message}</Text>
    </View>
  )
}

function VideoCard({
  item,
  height,
  active,
  muted,
  onToggleMute,
  onOpenAuthor,
  onOpenPost,
}: {
  item: VideoPost
  height: number
  active: boolean
  muted: boolean
  onToggleMute: () => void
  onOpenAuthor: () => void
  onOpenPost: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(true)
  const post = usePostShadow(item.post)
  const profile = useProfileShadow(item.post.author)
  const {currentAccount} = useSession()
  const [queueLike, queueUnlike] = usePostLikeMutationQueue(
    post === POST_TOMBSTONE ? item.post : post,
    undefined,
    undefined,
    'ImmersiveVideo',
  )
  const [queueFollow, queueUnfollow] = useProfileFollowMutationQueue(
    profile,
    'ImmersiveVideo',
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = muted
    if (active && playing) {
      const result = video.play()
      if (result && typeof result.catch === 'function') {
        void result.catch(() => setPlaying(false))
      }
    } else {
      video.pause()
    }

    return () => {
      video.pause()
    }
  }, [active, item.playlist, muted, playing])

  const video = createElement('video' as any, {
    ref: videoRef,
    key: item.playlist,
    src: item.playlist,
    muted,
    loop: true,
    playsInline: true,
    controls: false,
    preload: active ? 'auto' : 'metadata',
    onClick: () => setPlaying(value => !value),
    onPlay: () => setPlaying(true),
    onPause: () => {
      if (active) setPlaying(false)
    },
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      backgroundColor: '#08080b',
    },
  })

  const isLiked = post !== POST_TOMBSTONE && Boolean(post.viewer?.like)
  const likeCount = post !== POST_TOMBSTONE ? post.likeCount ?? 0 : 0
  const isFollowing = Boolean(profile.viewer?.following)
  const isOwnProfile = currentAccount?.did === item.post.author.did

  return (
    <View style={{height, width: '100%', backgroundColor: '#08080b', overflow: 'hidden'}}>
      {video}
      <View pointerEvents="box-none" style={{position: 'absolute', left: 16, right: 16, bottom: 28, gap: 10}}>
        <Pressable onPress={onOpenAuthor} accessibilityRole="button">
          <Text style={{color: 'white', fontWeight: '700', fontSize: 16}}>
            {item.post.author.displayName || item.post.author.handle}
          </Text>
          <Text style={{color: 'white', opacity: 0.85}}>@{item.post.author.handle}</Text>
        </Pressable>

        {item.post.record && typeof item.post.record === 'object' && 'text' in item.post.record && typeof item.post.record.text === 'string' ? (
          <Text style={{color: 'white'}}>{item.post.record.text}</Text>
        ) : null}

        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
          <Pressable
            onPress={() => isLiked ? void queueUnlike() : void queueLike()}
            accessibilityRole="button"
            accessibilityLabel={isLiked ? 'Unlike video' : 'Like video'}
            style={{paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 18}}>
            <Text style={{color: 'white'}}>{isLiked ? '♥' : '♡'} {likeCount}</Text>
          </Pressable>

          {!isOwnProfile ? (
            <Pressable
              onPress={() => isFollowing ? void queueUnfollow() : void queueFollow()}
              accessibilityRole="button"
              accessibilityLabel={isFollowing ? 'Unfollow creator' : 'Follow creator'}
              style={{paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 18}}>
              <Text style={{color: 'white'}}>{isFollowing ? 'Following' : 'Follow'}</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={onOpenPost} accessibilityRole="button" style={{paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 18}}>
            <Text style={{color: 'white'}}>View post</Text>
          </Pressable>

          <Pressable onPress={onToggleMute} accessibilityRole="button" style={{paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 18}}>
            <Text style={{color: 'white'}}>{muted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
