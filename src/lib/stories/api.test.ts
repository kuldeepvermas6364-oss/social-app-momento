import {getStoryMediaType} from './api'

describe('Momento story media types', () => {
  it('accepts common image MIME types', () => {
    expect(getStoryMediaType('image/jpeg')).toBe('image')
    expect(getStoryMediaType('image/png')).toBe('image')
    expect(getStoryMediaType('image/webp')).toBe('image')
  })

  it('accepts MP4 video', () => {
    expect(getStoryMediaType('video/mp4')).toBe('video')
  })

  it('rejects unsupported video containers and other media', () => {
    expect(() => getStoryMediaType('video/quicktime')).toThrow(TypeError)
    expect(() => getStoryMediaType('audio/mpeg')).toThrow(TypeError)
  })
})
