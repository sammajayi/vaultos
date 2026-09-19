/** The exact text a wallet signs to sign in. Shared so web and API can never drift. */
export const loginMessage = (address: string, issuedAt: string) =>
  `Sign in to VaultOS\n\nThis proves you own ${address.toLowerCase()}. It does not move funds or grant any permissions.\n\nIssued: ${issuedAt}`;
