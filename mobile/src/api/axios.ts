import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { isCognitoRejection, refreshSession } from '../auth/cognito';
import { getAccessToken, getRefreshToken, saveSession } from '../auth/tokenStorage';
import { notifySessionExpired } from '../auth/sessionExpiry';
import { EXPIRY_MARGIN_MS, needsRefresh } from '../auth/refreshPolicy';
import {
  getConnectionStatus,
  reportRequestSettled,
  reportTransportFailure,
  subscribeToConnection,
} from '../offline/connectivity';
import { baseURL } from './baseUrl';

/// Without a ceiling a request on a dead network hangs for around a minute, which is
/// long enough that the circuit breaker never sees enough failures to trip.
const REQUEST_TIMEOUT_MS = 12_000;

/// After a refresh we could not reach, stop asking from every single request. A recovered
/// link clears this early (see below); the timer is only the fallback for the case where
/// connectivity never noticed anything was wrong.
const UNAVAILABLE_COOLDOWN_MS = 30_000;

/// A refusal is worth remembering just long enough to stop one user action from asking
/// twice - the request interceptor and then the 401 handler. The session is being torn
/// down anyway, so this never needs to be long.
const EXPIRED_COOLDOWN_MS = 5_000;

const AXIOS_INSTANCE = axios.create({ baseURL, timeout: REQUEST_TIMEOUT_MS });

type TimedConfig = { metadata?: { start: number } };
type RetriableConfig = InternalAxiosRequestConfig & { retried?: boolean };

/// A refresh either worked, was refused, or never got an answer. Collapsing the last
/// two into a plain failure is what used to sign people out the moment they lost
/// signal - and the sign-out took the query cache with it.
type RefreshResult =
  | { status: 'ok'; token: string }
  | { status: 'expired' }
  | { status: 'unavailable' };

let refreshInFlight: Promise<RefreshResult> | null = null;
let unavailableUntil = 0;
let expiredUntil = 0;

// The cooldown above is a guess about the network, and connectivity knows better. Once
// the link is back there is no reason to keep refusing to try - without this the guess
// outlives the problem, and every request in those seconds goes out with a token we
// already know is dead.
subscribeToConnection(() => {
  if (getConnectionStatus() !== 'offline') unavailableUntil = 0;
});

const runRefresh = async (): Promise<RefreshResult> => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return { status: 'expired' };

  try {
    const session = await refreshSession(refreshToken);
    await saveSession(session);
    return { status: 'ok', token: session.tokens.accessToken };
  } catch (error) {
    // Cognito answering "no" is the only thing that means the session is really gone.
    // A fetch that never landed means we simply do not know yet, and guessing wrong
    // costs the user everything they have not synced.
    return isCognitoRejection(error) ? { status: 'expired' } : { status: 'unavailable' };
  }
};

const refreshAccessToken = (): Promise<RefreshResult> => {
  const now = Date.now();
  if (now < expiredUntil) return Promise.resolve({ status: 'expired' });
  if (now < unavailableUntil) return Promise.resolve({ status: 'unavailable' });

  refreshInFlight ??= runRefresh()
    .then((result) => {
      unavailableUntil =
        result.status === 'unavailable' ? Date.now() + UNAVAILABLE_COOLDOWN_MS : 0;
      expiredUntil = result.status === 'expired' ? Date.now() + EXPIRED_COOLDOWN_MS : 0;
      return result;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
};

const authorizationToken = async (): Promise<string | null> => {
  const stored = await getAccessToken();
  if (!stored) return null;
  if (!needsRefresh(stored.expiresAt, Date.now(), EXPIRY_MARGIN_MS)) return stored.token;

  const result = await refreshAccessToken();
  // Refused or unreachable: send what we have. Offline the request fails on transport
  // anyway, and online it is the 401 path below that gets to decide about signing out.
  return result.status === 'ok' ? result.token : stored.token;
};

AXIOS_INSTANCE.interceptors.request.use(async (config) => {
  const token = await authorizationToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  if (__DEV__) {
    (config as TimedConfig).metadata = { start: Date.now() };
    console.log('[api →]', config.method?.toUpperCase(), config.url);
  }

  return config;
});

AXIOS_INSTANCE.interceptors.response.use(
  (response) => {
    reportRequestSettled();

    if (__DEV__) {
      const start = (response.config as TimedConfig).metadata?.start;
      const ms = start ? `${Date.now() - start}ms` : '?';
      console.log('[api ←]', response.status, response.config.url, ms);
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    // A cancelled request says nothing about the network - we called it off ourselves.
    // Query keys carry TanStack's signal, so leaving a screen or running cancelQueries
    // aborts whatever was in flight; counting those would have the app declare itself
    // offline after a few quick taps on a perfect connection.
    if (axios.isCancel(error)) return Promise.reject(error);

    // Likewise a request that never reached the network because our own request
    // interceptor threw - a Keychain read, a refresh - has no config to speak of.
    if (!config) return Promise.reject(error);

    // A status code means the network carried the request and the server disagreed
    // with us - that says nothing about connectivity. Only a request that never
    // landed counts against the circuit breaker.
    if (error.response) reportRequestSettled();
    else reportTransportFailure();

    if (error.response?.status !== 401 || config.retried) {
      return Promise.reject(error);
    }

    config.retried = true;

    const result = await refreshAccessToken();

    if (result.status === 'expired') {
      notifySessionExpired();
      return Promise.reject(error);
    }

    // No verdict came back. Keep the session and let the caller try again later -
    // signing out here would discard everything not yet synced.
    if (result.status === 'unavailable') return Promise.reject(error);

    config.headers.Authorization = `Bearer ${result.token}`;
    return AXIOS_INSTANCE(config);
  },
);

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> =>
  AXIOS_INSTANCE(config).then(({ data }) => data);
