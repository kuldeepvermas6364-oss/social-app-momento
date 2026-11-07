import {useState} from 'react'
import {Pressable, View} from 'react-native'

import {useFirebaseAuth} from '#/lib/firebase/session'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Account controls for Firebase-only Momento users.
 *
 * The legacy AT Protocol profile screen depends on a DID and cannot represent
 * a Firebase UID. Keep the account tab useful without pretending those IDs
 * are interchangeable.
 */
export function FirebaseAccountScreen() {
  const t = useTheme()
  const {currentUser, currentProfile, signOut} = useFirebaseAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState('')

  const handleSignOut = async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    setError('')
    try {
      await signOut()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to sign out. Please try again.',
      )
      setIsSigningOut(false)
    }
  }

  const buttonStyle = {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center' as const,
    backgroundColor: t.palette.primary_500,
    opacity: isSigningOut ? 0.6 : 1,
  }

  return (
    <View
      style={[
        a.flex_1,
        a.justify_center,
        a.px_xl,
        a.py_2xl,
        t.atoms.bg,
      ]}>
      <View style={[a.w_full, a.gap_md, {maxWidth: 440, alignSelf: 'center'}]}>
        <Text style={[a.text_3xl, a.font_bold, t.atoms.text]}>Momento</Text>
        <Text style={[a.text_xl, a.font_semi_bold, t.atoms.text]}>
          Your account
        </Text>
        <Text style={[a.text_md, t.atoms.text]}>
          {currentProfile?.displayName || currentUser?.displayName || currentUser?.email}
        </Text>
        {currentProfile?.username ? (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            @{currentProfile.username}
          </Text>
        ) : null}
        {currentUser?.email ? (
          <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
            {currentUser.email}
          </Text>
        ) : null}
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          You are signed in with your Momento Firebase account.
        </Text>
        {error ? (
          <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out of Momento"
          accessibilityHint="Signs out of this Firebase account on this device."
          disabled={isSigningOut}
          onPress={() => void handleSignOut()}
          style={buttonStyle}>
          <Text style={{color: 'white', fontWeight: '600'}}>
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
