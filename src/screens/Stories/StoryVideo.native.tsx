import {useVideoPlayer, VideoView} from 'expo-video'

import {type StoryView} from '#/lib/stories/api'

export function StoryVideo({story}: {story: StoryView}) {
  const player = useVideoPlayer(story.mediaUrl, videoPlayer => {
    videoPlayer.loop = true
    videoPlayer.play()
  })

  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{flex: 1}}
    />
  )
}
