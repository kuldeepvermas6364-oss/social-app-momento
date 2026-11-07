import {createElement} from 'react'
import {View} from 'react-native'

import {type StoryView} from '#/lib/stories/api'

export function StoryVideo({story}: {story: StoryView}) {
  return (
    <View style={{flex: 1, backgroundColor: 'black'}}>
      {createElement('video', {
        src: story.mediaUrl,
        poster: story.thumbnailUrl,
        controls: true,
        autoPlay: true,
        loop: true,
        playsInline: true,
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        },
      })}
    </View>
  )
}
