import Svg, {
  Path,
  Text as SvgText,
  type PathProps,
  type SvgProps,
} from 'react-native-svg'

import {useTheme} from '#/alf'

const ratio = 64 / 250

export function LogomarkWithType({
  fill,
  ...rest
}: {fill?: PathProps['fill']} & SvgProps) {
  const t = useTheme()
  const size = parseInt(`${rest.width || 32}`)

  return (
    <Svg
      fill="none"
      viewBox="0 0 250 64"
      {...rest}
      width={size}
      height={Number(size) * ratio}>
      <Path
        d="M8 54V10h12l12 18 12-18h12v44H44V31L32 47 20 31v23Z"
        fill={fill || t.atoms.text.color}
      />
      <SvgText
        x="73"
        y="49"
        fontFamily="Inter"
        fontSize="47"
        fontWeight="700"
        fill={fill || t.atoms.text.color}>
        Momento
      </SvgText>
    </Svg>
  )
}
