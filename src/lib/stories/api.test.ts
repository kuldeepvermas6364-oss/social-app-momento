import {getStoryMediaType} from './api'

describe('Momento story media types', () => {
  it('accepts common image MIME types', () => {
    expect(getStoryMediaType('image/jpeg')).toBe('image')
    expect(getStoryMediaType('image/png')).toBe('image')
    expect(getStoryMediaType('image/webp')).toBe('image')
  })

  it('accepts video source formats for transcoding to MP4', () => {
    expect(getStoryMediaType('video/mp4')).toBe('video')
    expect(getStoryMediaType('video/quicktime')).toBe('video')
    expect(getStoryMediaType('video/webm')).toBe('video')
  })

  it('rejects unsupported video containers and other media', () => {
    expect(() => getStoryMediaType('audio/mpeg')).toThrow(TypeError)
  })
})
