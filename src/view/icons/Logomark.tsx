import Svg, {Path, type PathProps, type SvgProps} from 'react-native-svg'

import {usePalette} from '#/lib/hooks/usePalette'

export function Logomark({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  // @ts-expect-error react-native-svg accepts numeric strings here
  const size = parseInt(rest.width || 32)

  return (
    <Svg fill="none" viewBox="0 0 64 64" {...rest} width={size} height={size}>
      <Path
        fill={fill || pal.text.color}
        d="M10 54V10h11l11 16 11-16h11v44H42V30L32 44 22 30v24Z"
      />
    </Svg>
  )
}
