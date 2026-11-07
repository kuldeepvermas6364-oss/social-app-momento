import {useState} from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native'
import * as EmailValidator from 'email-validator'

import {useFirebaseAuth} from '#/lib/firebase/session'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'
import {Loader} from '#/components/Loader'

type Mode = 'signIn' | 'signUp'

function isAtLeast13(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return false
  }

  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDifference = today.getMonth() - date.getMonth()
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < date.getDate())
  ) {
    age -= 1
  }
  return age >= 13
}

export function FirebaseAuthGate({onDismiss}: {onDismiss?: () => void}) {
  const t = useTheme()
  const {
    currentUser,
    isReady,
    signIn,
    createAccount,
    signOut,
    sendPasswordResetEmail,
  } = useFirebaseAuth()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const inputStyle = [
    a.px_md,
    a.py_md,
    a.rounded_sm,
    a.text_md,
    t.atoms.text,
    t.atoms.bg_contrast_50,
    {
      borderWidth: 1,
      borderColor: t.palette.contrast_100,
      marginBottom: 12,
    },
  ]

  const buttonStyle = {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center' as const,
    backgroundColor: t.palette.primary_500,
    opacity: isProcessing ? 0.6 : 1,
  }

  const handleSubmit = async () => {
    if (isProcessing) return
    setError('')
    setNotice('')
    const normalizedEmail = email.trim().toLowerCase()

    if (!EmailValidator.validate(normalizedEmail)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }
    if (
      mode === 'signUp' &&
      !/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase())
    ) {
      setError(
        'Username must be 3–20 characters and use only letters, numbers, or underscores.',
      )
      return
    }
    if (mode === 'signUp' && !displayName.trim()) {
      setError('Enter your display name.')
      return
    }
    if (mode === 'signUp' && !isAtLeast13(dateOfBirth)) {
      setError('Enter a valid date of birth. You must be at least 13.')
      return
    }

    setIsProcessing(true)
    try {
      if (mode === 'signIn') {
        await signIn(normalizedEmail, password)
      } else {
        await createAccount({
          email: normalizedEmail,
          password,
          username: username.trim().toLowerCase(),
          displayName: displayName.trim(),
        })
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to complete authentication. Please try again.',
      )
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePasswordReset = async () => {
    setError('')
    setNotice('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!EmailValidator.validate(normalizedEmail)) {
      setError('Enter your email address first.')
      return
    }
    setIsProcessing(true)
    try {
      await sendPasswordResetEmail(normalizedEmail)
      setNotice('Password reset email sent. Check your inbox.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to send the password reset email.',
      )
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isReady) {
    return (
      <View style={[a.flex_1, a.align_center, a.justify_center, t.atoms.bg]}>
        <Loader size="large" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[a.flex_1, t.atoms.bg]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          a.flex_grow,
          a.justify_center,
          a.px_xl,
          a.py_2xl,
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={[a.w_full, a.gap_md, {maxWidth: 440, alignSelf: 'center'}]}>
          <Text style={[a.text_3xl, a.font_bold, t.atoms.text]}>
            Momento
          </Text>
          {currentUser ? (
            <>
              <Text style={[a.text_xl, a.font_semi_bold, t.atoms.text]}>
                Account connected
              </Text>
              <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
                {currentUser.displayName || currentUser.email}
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                Firebase Authentication is active for this account. Social
                features are being migrated to the Momento Firebase backend in
                the next development steps.
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={isProcessing}
                onPress={() => void signOut()}
                style={buttonStyle}>
                <Text style={{color: 'white', fontWeight: '600'}}>
                  Sign out
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[a.text_xl, a.font_semi_bold, t.atoms.text]}>
                {mode === 'signIn' ? 'Sign in to Momento' : 'Create your account'}
              </Text>
              <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                {mode === 'signIn'
                  ? 'Use your Momento email and password.'
                  : 'Create your Momento identity using Firebase Authentication.'}
              </Text>

              {mode === 'signUp' && (
                <>
                  <TextInput
                    accessibilityLabel="Display name"
                    autoCapitalize="words"
                    onChangeText={setDisplayName}
                    placeholder="Display name"
                    placeholderTextColor={t.palette.contrast_500}
                    style={inputStyle}
                    value={displayName}
                  />
                  <TextInput
                    accessibilityLabel="Username"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setUsername}
                    placeholder="Username"
                    placeholderTextColor={t.palette.contrast_500}
                    style={inputStyle}
                    value={username}
                  />
                  <TextInput
                    accessibilityLabel="Date of birth"
                    autoCapitalize="none"
                    onChangeText={setDateOfBirth}
                    placeholder="Date of birth (YYYY-MM-DD)"
                    placeholderTextColor={t.palette.contrast_500}
                    style={inputStyle}
                    value={dateOfBirth}
                  />
                </>
              )}

              <TextInput
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={t.palette.contrast_500}
                style={inputStyle}
                value={email}
              />
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete={
                  mode === 'signIn' ? 'current-password' : 'new-password'
                }
                onChangeText={setPassword}
                placeholder="Password (minimum 8 characters)"
                placeholderTextColor={t.palette.contrast_500}
                secureTextEntry
                style={inputStyle}
                value={password}
              />

              {error ? (
                <Text style={[a.text_sm, {color: t.palette.negative_500}]}>
                  {error}
                </Text>
              ) : null}
              {notice ? (
                <Text style={[a.text_sm, {color: t.palette.primary_500}]}>
                  {notice}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={isProcessing}
                onPress={() => void handleSubmit()}
                style={buttonStyle}>
                <Text style={{color: 'white', fontWeight: '600'}}>
                  {isProcessing
                    ? 'Please wait…'
                    : mode === 'signIn'
                      ? 'Sign in'
                      : 'Create account'}
                </Text>
              </Pressable>

              {mode === 'signIn' && (
                <Pressable
                  accessibilityRole="button"
                  disabled={isProcessing}
                  onPress={() => void handlePasswordReset()}
                  style={[a.py_sm, a.align_center]}>
                  <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                    Forgot password?
                  </Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={isProcessing}
                onPress={() => {
                  setError('')
                  setNotice('')
                  setMode(mode === 'signIn' ? 'signUp' : 'signIn')
                }}
                style={[a.py_sm, a.align_center]}>
                <Text style={[a.text_sm, {color: t.palette.primary_500}]}>
                  {mode === 'signIn'
                    ? 'New to Momento? Create an account'
                    : 'Already have an account? Sign in'}
                </Text>
              </Pressable>
              {onDismiss && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onDismiss}
                  style={[a.py_sm, a.align_center]}>
                  <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
                    Go back
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
