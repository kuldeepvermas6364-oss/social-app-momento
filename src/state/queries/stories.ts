import {useMemo} from 'react'
import {AtUri} from '@atproto/syntax'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {STALE} from '#/state/queries'
import {
  useAppviewClient,
  usePdsClient,
  useSession,
} from '#/state/session'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {
  createStory,
  deleteStory,
  listStoriesForAuthors,
  type CreateStoryOptions,
  type StoryAsset,
} from '#/lib/stories/api'

export const STORIES_QUERY_KEY = ['momento-stories']

export function useStoriesQuery() {
  const {currentAccount} = useSession()
  const appviewClient = useAppviewClient()
  const followsQuery = useProfileFollowsQuery(currentAccount?.did, {
    limit: 30,
  })
  const authorDids = useMemo(() => {
    const followed = followsQuery.data?.pages.flatMap(page =>
      page.follows.map(profile => profile.did),
    ) ?? []
    return currentAccount?.did
      ? [currentAccount.did, ...followed]
      : []
  }, [currentAccount?.did, followsQuery.data])

  return useQuery({
    queryKey: [...STORIES_QUERY_KEY, authorDids],
    queryFn: () => listStoriesForAuthors(appviewClient, authorDids),
    enabled: authorDids.length > 0,
    staleTime: STALE.SECONDS.THIRTY,
    refetchInterval: 60_000,
  })
}

export function useCreateStoryMutation() {
  const pdsClient = usePdsClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      asset,
      caption,
      altText,
    }: {
      asset: StoryAsset
      caption?: string
      altText?: string
    }) =>
      await createStory({
        pdsClient,
        asset,
        caption,
        altText,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: STORIES_QUERY_KEY})
    },
  })
}

export function useDeleteStoryMutation() {
  const pdsClient = usePdsClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (uri: string) => {
      const atUri = new AtUri(uri)
      await deleteStory(pdsClient, atUri.rkey)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: STORIES_QUERY_KEY})
    },
  })
}
