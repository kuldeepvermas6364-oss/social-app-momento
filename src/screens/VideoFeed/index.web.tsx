import {createElement, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {FlatList, Pressable, View, useWindowDimensions} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {RichText as RichTextAPI} from '@bsky/sdk/richtext'
import {useIsFocused, useNavigation, useRoute, type RouteProp} from '@react-navigation/native'

import {type CommonNavigatorParams, type NavigationProp} from '#/lib/routes/types'
import {getCurrentState, useOnAppStateChange} from '#/lib/appState'
import {createPlaybackDurationTracker} from '#/lib/media/video/analytics'
import {
  createPlaybackTelemetry,
  type PlaybackTelemetry,
} from '#/lib/media/video/playbackTelemetry'
import {POST_TOMBSTONE, usePostShadow} from '#/state/cache/post-shadow'
import {useProfileShadow} from '#/state/cache/profile-shadow'
import {
  FeedFeedbackProvider,
  useFeedFeedback,
  useFeedFeedbackContext,
} from '#/state/feed-feedback'
import {useFeedInfo} from '#/state/queries/feed'
import {usePostFeedQuery} from '#/state/queries/post-feed'
import {useProfileFollowMutationQueue} from '#/state/queries/profile'
import {useRequireAuth, useSession} from '#/state/session'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'
import {useAnalytics} from '#/analytics'
import {Text} from '#/components/Typography'
import {PostControls} from '#/components/PostControls'
import {Provider as ActiveVideoWebProvider, useActiveVideoWeb} from '#/components/Post/Embed/VideoEmbed/ActiveVideoWebContext'
import {VideoEmbedInnerWeb} from '#/components/Post/Embed/VideoEmbed/VideoEmbedInner/VideoEmbedInnerWeb'
import * as ReportDialogMetadataContext from '#/components/moderation/ReportDialog/ReportDialogMetadataContext'
import {ErrorBoundary} from '#/view/com/util/ErrorBoundary'
import {usePostFeedQuery as useFollowingV2PostFeedQuery} from '#/features/followingV2/home/queries/postFeed'
import {Header} from '#/screens/VideoFeed/components/Header'
import * as Layout from '#/components/Layout'
import {ThemeProvider} from '#/alf'

type VideoPost = {
  key: string
  post: app.bsky.feed.defs.PostView
  embed: app.bsky.embed.video.View
  feedContext: string | undefined
  reqId: string | undefined
}

export function VideoFeed() {
  const route = useRoute<RouteProp<CommonNavigatorParams, 'VideoFeed'>>()
  const navigation = useNavigation<NavigationProp>()
  const isFocused = useIsFocused()
  const {height} = useWindowDimensions()
  const {top} = useSafeAreaInsets()
  const {hasSession} = useSession()
  const {params} = route

  const feedDesc = useMemo(() => {
    if (params.type === 'feedgen') return `feedgen|${params.uri}` as const
    return `author|${params.did}|${params.filter}` as const
  }, [params])

  const feedUri = params.type === 'feedgen' ? params.uri : undefined
  const {data: feedInfo} = useFeedInfo(feedUri)
  const feedFeedback = useFeedFeedback(feedInfo ?? undefined, hasSession)
  const feedParams =
    params.type === 'feedgen' && params.sourceInterstitial !== 'none'
      ? {feedCacheKey: params.sourceInterstitial}
      : undefined
  const isFollowingV2 = params.type === 'feedgen' && params.followingV2 === true

  const legacyQuery = usePostFeedQuery(feedDesc, feedParams, {
    enabled: !isFollowingV2,
  })
  const followingV2Query = useFollowingV2PostFeedQuery(feedDesc, feedParams, {
    enabled: isFollowingV2,
  })
  const query = isFollowingV2 ? followingV2Query : legacyQuery
  const {data, error, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage} = query

  const videos = useMemo<VideoPost[]>(() => {
    const posts: VideoPost[] = []
    for (const page of data?.pages ?? []) {
      for (const slice of page.slices) {
        const item = slice.items.find(candidate => candidate.uri === slice.feedPostUri)
        const embed = item?.post.embed
        if (item && embed && bsky.isType(app.bsky.embed.video.view, embed)) {
          posts.push({
            key: item._reactKey,
            post: item.post,
            embed,
            feedContext: slice.feedContext,
            reqId: slice.reqId,
          })
        }
      }
    }
    const initialIndex = posts.findIndex(item => item.post.uri === params.initialPostUri)
    return initialIndex > 0 ? posts.slice(initialIndex) : posts
  }, [data, params.initialPostUri])

  const renderItem = useCallback(({item}: {item: VideoPost}) => (
    <VideoCard
      item={item}
      height={height}
      routeFocused={isFocused}
      onOpenAuthor={() => navigation.navigate('Profile', {name: item.post.author.handle})}
      onOpenPost={() => {
        const uri = item.post.uri.split('/')
        navigation.navigate('PostThread', {
          name: uri[2] ?? item.post.author.handle,
          rkey: uri[4] ?? '',
        })
      }}
    />
  ), [height, isFocused, navigation])

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
    <Layout.Screen
      minimalShell
      fullBleed
      noInsetTop
      style={{backgroundColor: 'black'}}>
      <ThemeProvider theme="dark">
        <FeedFeedbackProvider value={feedFeedback}>
          <ActiveVideoWebProvider>
            <View style={{flex: 1, backgroundColor: '#08080b'}}>
              <View style={{position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, paddingTop: top}}>
                <Header sourceContext={params} />
              </View>
              <FlatList
                data={videos}
                keyExtractor={item => item.key}
                renderItem={renderItem}
                pagingEnabled
                snapToAlignment="start"
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                initialNumToRender={2}
                maxToRenderPerBatch={2}
                windowSize={4}
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
          </ActiveVideoWebProvider>
        </FeedFeedbackProvider>
      </ThemeProvider>
    </Layout.Screen>
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
  routeFocused,
  onOpenAuthor,
  onOpenPost,
}: {
  item: VideoPost
  height: number
  routeFocused: boolean
  onOpenAuthor: () => void
  onOpenPost: () => void
}) {
  const ax = useAnalytics()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const lastKnownTime = useRef<number | undefined>(undefined)
  const hasTrackedView = useRef(false)
  const hasTrackedVideoImpression = useRef(false)
  const playbackStartTracked = useRef(false)
  const telemetryRef = useRef<PlaybackTelemetry | null>(null)
  const [onScreen, setOnScreen] = useState(false)
  const {active: selectedByViewport, setActive, sendPosition} = useActiveVideoWeb()
  const {sendInteraction, feedDescriptor} = useFeedFeedbackContext()
  const post = usePostShadow(item.post)
  const profile = useProfileShadow(item.post.author)
  const {currentAccount} = useSession()
  const requireAuth = useRequireAuth()
  const record = bsky.isType(app.bsky.feed.post, item.post.record)
    ? item.post.record
    : undefined
  const richText = useMemo(
    () => new RichTextAPI({text: record?.text || '', facets: record?.facets}),
    [record],
  )
  const [queueFollow, queueUnfollow] = useProfileFollowMutationQueue(
    profile,
    'ImmersiveVideo',
  )
  const presentation = item.embed.presentation === 'gif' ? 'gif' : 'video'
  const [durationTracker] = useState(() => {
    const tracker = createPlaybackDurationTracker({
      enabled: presentation !== 'gif',
      onSegment: segment => {
        ax.metric('video:playback:duration', {
          ...segment,
          postUri: item.post.uri,
          postAuthorDid: item.post.author.did,
          context: 'immersiveFeed',
          presentation,
        })
      },
    })
    tracker.setForeground(getCurrentState() === 'active')
    return tracker
  })

  useOnAppStateChange(state => {
    durationTracker.setForeground(state === 'active')
  })

  const active = routeFocused && selectedByViewport

  useEffect(() => {
    durationTracker.setActive(active && onScreen)
  }, [active, durationTracker, onScreen])

  useEffect(() => {
    if (active) {
      if (telemetryRef.current == null) {
        telemetryRef.current = createPlaybackTelemetry({
          surface: 'feed',
          presentation,
        })
      }
      telemetryRef.current.activated()
    } else {
      telemetryRef.current?.deactivated()
    }
  }, [active, presentation])

  useEffect(() => {
    return () => {
      telemetryRef.current?.deactivated()
      durationTracker.flush('unmounted')
    }
  }, [durationTracker])

  useEffect(() => {
    const node = cardRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (!entry) return
        setOnScreen(entry.isIntersecting)
        sendPosition(entry.boundingClientRect.y + entry.boundingClientRect.height / 2)
      },
      {threshold: [0, 0.5, 1]},
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [sendPosition])

  useEffect(() => {
    if (!active) return
    if (!hasTrackedVideoImpression.current) {
      hasTrackedVideoImpression.current = true
      ax.metric('video:impression', {
        postUri: item.post.uri,
        postAuthorDid: item.post.author.did,
        context: 'immersiveFeed',
        presentation: item.embed.presentation === 'gif' ? 'gif' : 'video',
      })
    }
    sendInteraction({
      item: item.post.uri,
      event: 'app.bsky.feed.defs#interactionSeen',
      feedContext: item.feedContext,
      reqId: item.reqId,
    })
    if (!hasTrackedView.current) {
      hasTrackedView.current = true
      ax.metric('post:view', {
        uri: item.post.uri,
        authorDid: item.post.author.did,
        isReply: Boolean(record?.reply),
        logContext: 'ImmersiveVideo',
        feedDescriptor,
      })
    }
  }, [
    active,
    ax,
    feedDescriptor,
    item.embed.presentation,
    item.feedContext,
    item.post.author.did,
    item.post.uri,
    item.reqId,
    record?.reply,
    sendInteraction,
  ])

  const isFollowing = Boolean(profile.viewer?.following)
  const isOwnProfile = currentAccount?.did === item.post.author.did

  return (
    <View style={{height, width: '100%', backgroundColor: '#08080b', overflow: 'hidden'}}>
      {createElement('div' as any, {
        ref: cardRef,
        'aria-hidden': true,
        style: {position: 'absolute', inset: 0, pointerEvents: 'none'},
      })}
      <ErrorBoundary
        renderError={() => <StatusMessage message="This video could not be played. Please try again later." />}>
        <ReportDialogMetadataContext.Provider>
          <VideoEmbedInnerWeb
            embed={item.embed}
            active={active}
            setActive={setActive}
            onScreen={onScreen && routeFocused}
            lastKnownTime={lastKnownTime}
            onPlaybackStart={autoplay => {
              if (playbackStartTracked.current) return
              playbackStartTracked.current = true
              ax.metric('video:playback:start', {
                postUri: item.post.uri,
                postAuthorDid: item.post.author.did,
                context: 'immersiveFeed',
                presentation,
                autoplay,
              })
            }}
            onPlaybackProgress={time => {
              lastKnownTime.current = time
              durationTracker.observeProgress(time)
            }}
            onPlaybackStateChange={state => {
              durationTracker.setPlaying(state === 'playing')
              durationTracker.setBuffering(state === 'buffering')
              if (state === 'playing') telemetryRef.current?.playing()
            }}
            onPlaybackEnd={() => durationTracker.flush('ended')}
          />
        </ReportDialogMetadataContext.Provider>
      </ErrorBoundary>

      <View pointerEvents="box-none" style={{position: 'absolute', left: 16, right: 16, bottom: 28, gap: 10}}>
        <Pressable onPress={onOpenAuthor} accessibilityRole="button">
          <Text style={{color: 'white', fontWeight: '700', fontSize: 16}}>
            {item.post.author.displayName || item.post.author.handle}
          </Text>
          <Text style={{color: 'white', opacity: 0.85}}>@{item.post.author.handle}</Text>
        </Pressable>

        {record?.text?.trim() ? <Text style={{color: 'white'}}>{record.text}</Text> : null}

        {!isOwnProfile ? (
          <Pressable
            onPress={() => requireAuth(() => isFollowing ? void queueUnfollow() : void queueFollow())}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? 'Unfollow creator' : 'Follow creator'}
            style={{alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 18}}>
            <Text style={{color: 'white'}}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </Pressable>
        ) : null}

        {post !== POST_TOMBSTONE && record ? (
          <PostControls
            richText={richText}
            post={post}
            record={record}
            feedContext={item.feedContext}
            reqId={item.reqId}
            logContext="ImmersiveVideo"
            onPressReply={onOpenPost}
            big
          />
        ) : post === POST_TOMBSTONE ? (
          <Text style={{color: 'white'}}>This post has been deleted.</Text>
        ) : null}
      </View>
    </View>
  )
}
