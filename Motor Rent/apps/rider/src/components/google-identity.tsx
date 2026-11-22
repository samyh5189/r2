/** Google's own sign-in button is web-only; native apps use the in-app browser flow in SocialButtons. */
export const googleIdentityAvailable = false;

export function GoogleIdentityButton(_: { onSignedIn: () => void; onError: (message: string) => void }) {
  return null;
}
