// Thin client over the Cognito user pool API.
//
// The official SDK (amazon-cognito-identity-js) was dropped on purpose: even for
// USER_PASSWORD_AUTH it builds an SRP helper whose constructor runs a 2048-bit
// modular exponentiation on the JS thread, freezing the UI for seconds. It also
// dragged in AsyncStorage and a native random-number module. These endpoints are
// plain JSON POSTs for a public app client — no signing, no crypto on our side.

const region = process.env.EXPO_PUBLIC_COGNITO_REGION;
const clientId = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;

if (!region || !clientId) {
  throw new Error(
    'Cognito env vars missing. Set EXPO_PUBLIC_COGNITO_REGION and EXPO_PUBLIC_COGNITO_CLIENT_ID in mobile/.env',
  );
}

const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

type Action =
  | 'SignUp'
  | 'ConfirmSignUp'
  | 'ResendConfirmationCode'
  | 'InitiateAuth'
  | 'RevokeToken';

/// Cognito answered and refused. Anything else escaping these calls - fetch rejecting
/// on a dead network, a body that will not parse - means the request never got a
/// verdict, and offline that difference decides whether the user stays signed in.
export class CognitoRejection extends Error {
  readonly httpStatus: number;

  constructor(message: string, name: string, httpStatus: number) {
    super(message);
    this.name = name;
    this.httpStatus = httpStatus;
  }
}

export const isCognitoRejection = (error: unknown): error is CognitoRejection =>
  error instanceof CognitoRejection;

/// Matches the ceiling on the API client. Without one, these calls inherit the system
/// TCP timeout - around a minute - and because the request interceptor awaits a refresh
/// before anything is sent, that minute is spent inside the interceptor where no timeout
/// of ours applies and the circuit breaker sees nothing at all.
const CALL_TIMEOUT_MS = 12_000;

const call = async <T>(action: Action, body: object): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    // Errors arrive as { __type, message }, where __type may be prefixed with a
    // namespace, e.g. "com.amazon.coral.service#NotAuthorizedException".
    throw new CognitoRejection(
      payload.message ?? 'Nie udało się połączyć z Cognito',
      String(payload.__type ?? 'CognitoError').split('#').pop() ?? 'CognitoError',
      response.status,
    );
  }

  return payload as T;
};

export type Tokens = {
  accessToken: string;
  idToken: string;
  refreshToken: string;
};

export type Session = {
  userId: string;
  name: string;
  email: string;
  tokens: Tokens;
  /// Epoch ms. Lets the request path refresh before a 401 rather than after one.
  expiresAt: number;
};

type AuthenticationResult = {
  AccessToken: string;
  IdToken: string;
  RefreshToken?: string;
  ExpiresIn: number;
};

// Reads the claims out of the ID token. No signature check here on purpose — the
// token comes straight from Cognito over TLS, and the backend is what verifies it.
const decodeIdToken = (idToken: string): { sub: string; name: string; email: string } => {
  const segment = idToken.split('.')[1];
  if (!segment) throw new Error('Nieprawidłowy token tożsamości');

  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    segment.length + ((4 - (segment.length % 4)) % 4),
    '=',
  );

  const binary = atob(base64);
  const json = decodeURIComponent(
    binary
      .split('')
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );

  const claims = JSON.parse(json);
  const email = String(claims.email ?? '');

  return {
    sub: String(claims.sub),
    email,
    // Sign-up always sends a name, but accounts created another way (the admin API,
    // or anything predating this) may lack it. The greeting then drops the name
    // rather than falling back to the email address.
    name: String(claims.name ?? ''),
  };
};

const toSession = (result: AuthenticationResult, refreshToken: string): Session => {
  const { sub, name, email } = decodeIdToken(result.IdToken);
  return {
    userId: sub,
    name,
    email,
    tokens: { accessToken: result.AccessToken, idToken: result.IdToken, refreshToken },
    expiresAt: Date.now() + result.ExpiresIn * 1000,
  };
};

export const signUp = (email: string, password: string, name: string): Promise<void> =>
  call('SignUp', {
    ClientId: clientId,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name },
    ],
  }).then(() => undefined);

export const confirmSignUp = (email: string, code: string): Promise<void> =>
  call('ConfirmSignUp', {
    ClientId: clientId,
    Username: email,
    ConfirmationCode: code,
  }).then(() => undefined);

export const resendConfirmationCode = (email: string): Promise<void> =>
  call('ResendConfirmationCode', { ClientId: clientId, Username: email }).then(() => undefined);

export const signIn = async (email: string, password: string): Promise<Session> => {
  const { AuthenticationResult } = await call<{ AuthenticationResult: AuthenticationResult }>(
    'InitiateAuth',
    {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    },
  );

  if (!AuthenticationResult?.RefreshToken) {
    throw new Error('Cognito nie zwróciło kompletu tokenów');
  }

  return toSession(AuthenticationResult, AuthenticationResult.RefreshToken);
};

export const refreshSession = async (refreshToken: string): Promise<Session> => {
  const { AuthenticationResult } = await call<{ AuthenticationResult: AuthenticationResult }>(
    'InitiateAuth',
    {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    },
  );

  // A refresh response carries no refresh token: the current one stays valid.
  return toSession(AuthenticationResult, refreshToken);
};

export const revokeRefreshToken = (refreshToken: string): Promise<void> =>
  call('RevokeToken', { ClientId: clientId, Token: refreshToken }).then(() => undefined);
