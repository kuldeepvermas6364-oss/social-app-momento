import {FirebaseAuthGate} from './FirebaseAuthGate'

enum ScreenState {
  S_LoginOrCreateAccount,
  S_Login,
  S_CreateAccount,
  S_StarterPack,
  S_GroupChatJoinRequest,
}

export {ScreenState as LoggedOutScreenState}

/**
 * Firebase-first logged-out surface. The legacy Bluesky sign-in/signup flow
 * has been removed from this route so credentials are sent only to Momento's
 * configured Firebase project.
 */
export function LoggedOut({onDismiss}: {onDismiss?: () => void}) {
  return <FirebaseAuthGate onDismiss={onDismiss} />
}
