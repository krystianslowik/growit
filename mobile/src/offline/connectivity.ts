/// The system half of connectivity: NetInfo, timers, and the onlineManager flag.
/// Every decision about what the state should be lives in connectionState.ts.

import { AppState } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { baseURL, healthUrl } from '../api/baseUrl';
import {
  ConnectionEvent,
  ConnectionStatus,
  initialConnectionState,
  reduceConnection,
  shouldProbe,
  statusOf,
} from './connectionState';

export type { ConnectionStatus };

/// Backoff for the health probe while the circuit is open; the last delay repeats.
const PROBE_DELAYS_MS = [15_000, 30_000, 60_000];
const PROBE_TIMEOUT_MS = 5_000;

let state = initialConnectionState;
let status = statusOf(state);
const listeners = new Set<() => void>();

let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeAttempt = 0;

const stopProbing = () => {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
  probeAttempt = 0;
};

const scheduleProbe = () => {
  if (probeTimer) return;
  const delay = PROBE_DELAYS_MS[Math.min(probeAttempt, PROBE_DELAYS_MS.length - 1)];
  probeTimer = setTimeout(() => void runProbe(), delay);
};

const dispatch = (event: ConnectionEvent) => {
  const previous = state;
  state = reduceConnection(previous, event);

  // onlineManager is the gate TanStack Query checks before firing a request or
  // resuming a paused mutation, and this module is its only writer. Letting NetInfo
  // drive it directly would reopen the tap on the next wifi event, undoing a circuit
  // we opened because requests were actually failing. 'unstable' still counts as
  // online - we want those requests attempted, just flagged.
  onlineManager.setOnline(statusOf(state) !== 'offline');

  const wantsProbe = shouldProbe(state);
  if (wantsProbe) {
    if (!shouldProbe(previous)) probeAttempt = 0;
    scheduleProbe();
  } else {
    stopProbing();
  }

  const next = statusOf(state);
  if (next === status) return;

  if (__DEV__) {
    console.log(`[net] ${status} -> ${next}`, {
      netInfoOnline: state.netInfoOnline,
      failures: state.consecutiveFailures,
      circuitOpen: state.circuitOpen,
    });
  }

  status = next;
  listeners.forEach((listener) => listener());
};

const runProbe = async () => {
  probeTimer = null;
  probeAttempt += 1;
  if (!shouldProbe(state)) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    if (response.ok) {
      dispatch({ type: 'probe-succeeded' });
      return;
    }
  } catch {
    // Still down.
  } finally {
    clearTimeout(timeout);
  }

  if (shouldProbe(state)) scheduleProbe();
};

const handleNetInfo = (netInfo: NetInfoState) => {
  // Only isConnected, deliberately. isInternetReachable is the verdict of the probing we
  // just turned off, and it stays null until that probing answers - so reading it would
  // mean either pausing everything at app start or trusting a mechanism we no longer run.
  dispatch({ type: 'netinfo-changed', online: netInfo.isConnected === true });
};

let started = false;

export const setupConnectivity = () => {
  if (started) return;
  started = true;

  // NetInfo answers one question here and one only: is there a link at all. Whether the
  // API is actually reachable is the circuit breaker's job further down, and letting
  // both decide it was a mistake worth spelling out:
  //
  //   - useNativeReachability defaults to true, so on Android a reachabilityUrl is
  //     ignored outright and the two platforms end up disagreeing about what "online"
  //     means;
  //   - where it did run, a down API made NetInfo report the link as unreachable, which
  //     turned off shouldProbe() - disabling our own backoff in the exact situation it
  //     was written for, while NetInfo hammered /health every five seconds with none.
  //
  // The breaker is the better judge anyway: it watches real requests rather than a
  // synthetic one, and behaves the same on both platforms.
  NetInfo.configure({ reachabilityShouldRun: () => false });

  NetInfo.addEventListener(handleNetInfo);
  void NetInfo.fetch().then(handleNetInfo);

  // Take the flag outright. The stock listener is a web one (window online/offline),
  // and every write here goes through dispatch() instead. The returned cleanup matters:
  // onSubscribe reinstalls the setup whenever it finds none, which would re-run this
  // on every QueryClient mount.
  onlineManager.setEventListener(() => () => {});

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (appState) => {
      // iOS reports 'inactive' for things that are not really leaving the app: the
      // notification centre, the app switcher, a system alert. Treating those as a loss
      // of focus means a full refetch of everything stale the moment the user pulls down
      // the status bar and lets go.
      if (appState === 'inactive') return;
      handleFocus(appState === 'active');
    });
    return () => subscription.remove();
  });

  if (__DEV__) console.log('[net] connectivity watching', baseURL);
};

/// Any response at all, including 4xx/5xx: the network carried the request and the
/// server disagreed, which says nothing about connectivity.
export const reportRequestSettled = () => dispatch({ type: 'request-settled' });

/// A request that never landed - the only kind that counts against the breaker.
export const reportTransportFailure = () => dispatch({ type: 'transport-failed' });

export const subscribeToConnection = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getConnectionStatus = (): ConnectionStatus => status;

/// Dev-only escape hatch behind the settings toggle: exercises the exact path
/// production uses, without touching the device radio.
export const forceOffline = (value: boolean) => dispatch({ type: 'forced-offline', value });

export const isForcedOffline = () => state.forcedOffline;
