import Svg, {
  type PathProps,
  type SvgProps,
  Text as SvgText,
} from 'react-native-svg'

import {usePalette} from '#/lib/hooks/usePalette'

const ratio = 52 / 210

export function Logotype({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const pal = usePalette('default')
  // @ts-expect-error react-native-svg accepts numeric strings here
  const size = parseInt(rest.width || 32)

  return (
    <Svg
      fill="none"
      viewBox="0 0 210 52"
      {...rest}
      width={size}
      height={Number(size) * ratio}>
      <SvgText
        x="1"
        y="41"
        fontFamily="Inter"
        fontSize="39"
        fontWeight="700"
        fill={fill || pal.text.color}>
        Momento
      </SvgText>
    </Svg>
  )
}
