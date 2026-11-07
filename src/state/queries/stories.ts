import {useMemo} from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  createStory,
  deleteStory,
  listStoriesForAuthors,
  type StoryAsset,
} from '#/lib/stories/api'
import {STALE} from '#/state/queries'
import {useProfileFollowsQuery} from '#/state/queries/profile-follows'
import {
  useAppviewClient,
  usePdsClient,
  useSession,
} from '#/state/session'

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
      await deleteStory(pdsClient, uri)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: STORIES_QUERY_KEY})
    },
  })
}
