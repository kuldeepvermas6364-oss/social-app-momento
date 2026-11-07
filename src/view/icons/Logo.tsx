import {forwardRef} from 'react'
import {type TextProps} from 'react-native'
import Svg, {
  Defs,
  LinearGradient,
  Path,
  type PathProps,
  Stop,
  type SvgProps,
} from 'react-native-svg'
import {Image} from 'expo-image'

import {useLogoVariant} from '#/view/icons/useLogoVariant'
import {flatten, useTheme} from '#/alf'

type Props = {
  allowVariants?: boolean
  fill?: PathProps['fill']
  style?: TextProps['style']
} & Omit<SvgProps, 'style'>

export const Logo = forwardRef(function LogoImpl(props: Props, ref) {
  const t = useTheme()
  const {allowVariants = true, fill, ...rest} = props
  const gradient = fill === 'sky'
  const styles = flatten(props.style)
  const _fill = gradient
    ? 'url(#momento)'
    : fill || styles?.color || t.palette.primary_500
  // @ts-expect-error react-native-svg accepts numeric strings here
  const size = parseInt(rest.width || 32, 10)
  const logoVariant = useLogoVariant(allowVariants)

  if (logoVariant === 'kawaii') {
    return (
      <Image
        source={require('../../../assets/logo.png')}
        accessibilityLabel="Momento"
        accessibilityHint=""
        accessibilityIgnoresInvertColors
        style={[{height: size, aspectRatio: 1}]}
      />
    )
  }

  return (
    <Svg
      fill="none"
      // @ts-expect-error react-native-svg accepts the forwarded ref
      ref={ref}
      viewBox="0 0 64 64"
      {...rest}
      style={[{width: size, height: size}, styles]}>
      {gradient && (
        <Defs>
          <LinearGradient id="momento" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#8B35F6" stopOpacity="1" />
            <Stop offset="1" stopColor="#00A9EF" stopOpacity="1" />
          </LinearGradient>
        </Defs>
      )}
      <Path
        fill={_fill}
        d="M10 54V10h11l11 16 11-16h11v44H42V30L32 44 22 30v24Z"
      />
    </Svg>
  )
})
