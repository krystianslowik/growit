import * as SecureStore from 'expo-secure-store';
import { Session } from './cognito';

const ACCESS_TOKEN_KEY = 'growit.accessToken';
const ID_TOKEN_KEY = 'growit.idToken';
const REFRESH_TOKEN_KEY = 'growit.refreshToken';
const NAME_KEY = 'growit.name';
const EMAIL_KEY = 'growit.email';
const USER_ID_KEY = 'growit.userId';
const EXPIRES_AT_KEY = 'growit.expiresAt';

export type StoredAccessToken = { token: string; expiresAt: number };

/// Every outgoing request reads the access token, and each read is a Keychain round
/// trip - noticeable when a queue of writes drains at once. Only the two functions
/// that can change the stored token touch this.
let cachedAccessToken: StoredAccessToken | null = null;

/// Sessions written before expiry was tracked have nothing here. Zero reads as
/// "expired", which refreshes on the next request instead of signing the user out.
const toExpiry = (stored: string | null): number => Number(stored ?? 0) || 0;

export const saveSession = async (session: Session): Promise<void> => {
  // Anything already cached describes the session being replaced, so it has to go before
  // the write rather than after: a failed write must not leave a token in memory that is
  // not on disk, and the next read should go and find out what is really stored.
  cachedAccessToken = null;

  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.tokens.accessToken),
    SecureStore.setItemAsync(ID_TOKEN_KEY, session.tokens.idToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.tokens.refreshToken),
    SecureStore.setItemAsync(NAME_KEY, session.name),
    SecureStore.setItemAsync(EMAIL_KEY, session.email),
    SecureStore.setItemAsync(USER_ID_KEY, session.userId),
    SecureStore.setItemAsync(EXPIRES_AT_KEY, String(session.expiresAt)),
  ]);

  cachedAccessToken = { token: session.tokens.accessToken, expiresAt: session.expiresAt };
};

export const loadSession = async (): Promise<Session | null> => {
  const [accessToken, idToken, refreshToken, name, email, userId, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(ID_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(NAME_KEY),
    SecureStore.getItemAsync(EMAIL_KEY),
    SecureStore.getItemAsync(USER_ID_KEY),
    SecureStore.getItemAsync(EXPIRES_AT_KEY),
  ]);

  if (!accessToken || !idToken || !refreshToken || !email || !userId) return null;

  const expiry = toExpiry(expiresAt);
  cachedAccessToken = { token: accessToken, expiresAt: expiry };

  return {
    userId,
    name: name ?? '',
    email,
    tokens: { accessToken, idToken, refreshToken },
    expiresAt: expiry,
  };
};

export const getAccessToken = async (): Promise<StoredAccessToken | null> => {
  if (cachedAccessToken) return cachedAccessToken;

  const [token, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRES_AT_KEY),
  ]);
  if (!token) return null;

  cachedAccessToken = { token, expiresAt: toExpiry(expiresAt) };
  return cachedAccessToken;
};

export const getRefreshToken = (): Promise<string | null> =>
  SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

export const getStoredEmail = (): Promise<string | null> => SecureStore.getItemAsync(EMAIL_KEY);

export const clearSession = async (): Promise<void> => {
  cachedAccessToken = null;

  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(ID_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(NAME_KEY),
    SecureStore.deleteItemAsync(EMAIL_KEY),
    SecureStore.deleteItemAsync(USER_ID_KEY),
    SecureStore.deleteItemAsync(EXPIRES_AT_KEY),
  ]);
};
