import {createElement, useCallback, useMemo, useState} from 'react'
import {FlatList, Pressable, View, useWindowDimensions} from 'react-native'
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native'

import {type CommonNavigatorParams, type NavigationProp} from '#/lib/routes/types'
import {usePostFeedQuery} from '#/state/queries/post-feed'
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
  const {height} = useWindowDimensions()
  const {params} = route

  const feedDesc = useMemo(() => {
    if (params.type === 'feedgen') return `feedgen|${params.uri}` as const
    return `author|${params.did}|${params.filter}` as const
  }, [params])

  const {data, error, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage} =
    usePostFeedQuery(feedDesc)

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

  const renderItem = useCallback(({item, index}: {item: VideoPost; index: number}) => {
    return (
      <VideoCard
        item={item}
        height={height}
        active={index === activeIndex}
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
    )
  }, [activeIndex, height, muted, navigation])

  if (isLoading) {
    return <View style={{flex: 1, backgroundColor: '#08080b', alignItems: 'center', justifyContent: 'center'}}>
      <Text style={{color: 'white'}}>Loading videos…</Text>
    </View>
  }

  if (error) {
    return <View style={{flex: 1, backgroundColor: '#08080b', alignItems: 'center', justifyContent: 'center', padding: 24}}>
      <Text style={{color: 'white'}}>Videos could not be loaded. Check your connection and try again.</Text>
    </View>
  }

  if (!videos.length) {
    return <View style={{flex: 1, backgroundColor: '#08080b', alignItems: 'center', justifyContent: 'center', padding: 24}}>
      <Text style={{color: 'white'}}>No videos in this feed yet.</Text>
    </View>
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
          const nextIndex = Math.round(event.nativeEvent.contentOffset.y / height)
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
        ListFooterComponent={isFetchingNextPage ? <View style={{height: 64, alignItems: 'center', justifyContent: 'center'}}><Text style={{color: 'white'}}>Loading more…</Text></View> : null}
      />
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
  const [playing, setPlaying] = useState(true)
  const video = createElement('video' as any, {
    key: item.playlist,
    src: item.playlist,
    autoPlay: active && playing,
    muted,
    loop: true,
    playsInline: true,
    controls: false,
    preload: active ? 'auto' : 'metadata',
    onClick: () => setPlaying(value => !value),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      backgroundColor: '#08080b',
    },
  })

  return (
    <View style={{height, width: '100%', backgroundColor: '#08080b', overflow: 'hidden'}}>
      {video}
      <View pointerEvents="box-none" style={{position: 'absolute', left: 16, right: 16, bottom: 28, gap: 10}}>
        <Pressable onPress={onOpenAuthor} accessibilityRole="button">
          <Text style={{color: 'white', fontWeight: '700', fontSize: 16}}>{item.post.author.displayName || item.post.author.handle}</Text>
          <Text style={{color: 'white', opacity: 0.85}}>@{item.post.author.handle}</Text>
        </Pressable>
        {item.post.record && typeof item.post.record === 'object' && 'text' in item.post.record && typeof item.post.record.text === 'string' ? (
          <Text style={{color: 'white'}}>{item.post.record.text}</Text>
        ) : null}
        <View style={{flexDirection: 'row', gap: 12}}>
          <Pressable onPress={onOpenPost} accessibilityRole="button" style={{paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 18}}>
            <Text style={{color: 'white'}}>View post</Text>
          </Pressable>
          <Pressable onPress={onToggleMute} accessibilityRole="button" style={{paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 18}}>
            <Text style={{color: 'white'}}>{muted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
