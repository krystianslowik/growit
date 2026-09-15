/// The decision half of connectivity: what the connection state should be, given what
/// happened. Deliberately free of NetInfo, timers and onlineManager so it can be read
/// - and tested - on its own; connectivity.ts owns the talking-to-the-system half.

export type ConnectionStatus = 'online' | 'unstable' | 'offline';

/// Transport failures tolerated before we warn, and before we stop claiming to be
/// online. A flaky connection reports "connected" the whole time it is failing, so
/// counting dropped requests is the only thing that tells the two apart.
export const UNSTABLE_AFTER = 3;
export const CIRCUIT_OPENS_AFTER = 5;

export type ConnectionState = {
  netInfoOnline: boolean;
  consecutiveFailures: number;
  circuitOpen: boolean;
  forcedOffline: boolean;
};

export type ConnectionEvent =
  /// Any response, including 4xx/5xx: the network carried it, so the link is fine.
  | { type: 'request-settled' }
  /// A request that never landed - the only kind that says anything about the link.
  | { type: 'transport-failed' }
  | { type: 'netinfo-changed'; online: boolean }
  | { type: 'probe-succeeded' }
  | { type: 'forced-offline'; value: boolean };

export const initialConnectionState: ConnectionState = {
  netInfoOnline: true,
  consecutiveFailures: 0,
  circuitOpen: false,
  forcedOffline: false,
};

const recovered = (state: ConnectionState): ConnectionState => ({
  ...state,
  consecutiveFailures: 0,
  circuitOpen: false,
});

export const reduceConnection = (
  state: ConnectionState,
  event: ConnectionEvent,
): ConnectionState => {
  switch (event.type) {
    case 'request-settled':
    case 'probe-succeeded':
      return recovered(state);

    case 'transport-failed': {
      // Capped so the state space stays small; past the threshold the count carries
      // no extra meaning, and requests stop arriving once the circuit is open anyway.
      const consecutiveFailures = Math.min(state.consecutiveFailures + 1, CIRCUIT_OPENS_AFTER);
      return {
        ...state,
        consecutiveFailures,
        circuitOpen: state.circuitOpen || consecutiveFailures >= CIRCUIT_OPENS_AFTER,
      };
    }

    case 'netinfo-changed':
      if (!event.online) return { ...state, netInfoOnline: false };

      // Only a link that actually came back earns the API an immediate retry. NetInfo
      // fires on every change to what it tracks, not just on connectivity - a wifi to
      // cellular handoff, a 4g to 5g switch, a reachability flag on iOS all arrive here
      // as online:true. Treating those as recovery would clear a circuit we opened
      // because requests were genuinely failing, waking the queue onto a link we
      // already know is dead and spending its retries for nothing.
      if (state.netInfoOnline) return state;

      return recovered({ ...state, netInfoOnline: true });

    case 'forced-offline':
      return event.value
        ? { ...state, forcedOffline: true }
        : recovered({ ...state, forcedOffline: false });
  }
};

export const statusOf = (state: ConnectionState): ConnectionStatus => {
  if (state.forcedOffline || !state.netInfoOnline || state.circuitOpen) return 'offline';
  return state.consecutiveFailures >= UNSTABLE_AFTER ? 'unstable' : 'online';
};

/// Probing only makes sense when the link is up but the API is not answering. With no
/// link at all NetInfo will say when that changes, so polling would just burn battery.
export const shouldProbe = (state: ConnectionState): boolean =>
  state.circuitOpen && state.netInfoOnline && !state.forcedOffline;
