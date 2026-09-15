/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ConnectionEvent } from './connectionState.ts';
import {
  CIRCUIT_OPENS_AFTER,
  UNSTABLE_AFTER,
  initialConnectionState,
  reduceConnection,
  shouldProbe,
  statusOf,
} from './connectionState.ts';

const feed = (...events: ConnectionEvent[]) =>
  events.reduce(reduceConnection, initialConnectionState);

const failures = (count: number): ConnectionEvent[] =>
  Array.from({ length: count }, () => ({ type: 'transport-failed' }) as const);

describe('statusOf', () => {
  test('starts online', () => {
    assert.equal(statusOf(initialConnectionState), 'online');
  });

  test('stays online while failures are below the warning threshold', () => {
    const state = feed(...failures(UNSTABLE_AFTER - 1));
    assert.equal(statusOf(state), 'online');
  });

  test('warns once failures reach the threshold', () => {
    const state = feed(...failures(UNSTABLE_AFTER));
    assert.equal(statusOf(state), 'unstable');
  });

  test('unstable still counts as online, so requests keep being attempted', () => {
    const state = feed(...failures(UNSTABLE_AFTER));
    assert.notEqual(statusOf(state), 'offline');
  });

  test('goes offline once the circuit opens', () => {
    const state = feed(...failures(CIRCUIT_OPENS_AFTER));
    assert.equal(statusOf(state), 'offline');
    assert.equal(state.circuitOpen, true);
  });
});

describe('what counts as a connectivity signal', () => {
  test('a settled response clears the failure streak', () => {
    // A 404 or 500 means the network carried the request and the server disagreed.
    // Letting those trip the breaker would take the app offline over a bad payload.
    const state = feed(...failures(CIRCUIT_OPENS_AFTER - 1), { type: 'request-settled' });
    assert.equal(state.consecutiveFailures, 0);
    assert.equal(statusOf(state), 'online');
  });

  test('a settled response closes an open circuit', () => {
    const state = feed(...failures(CIRCUIT_OPENS_AFTER), { type: 'request-settled' });
    assert.equal(state.circuitOpen, false);
    assert.equal(statusOf(state), 'online');
  });

  test('the failure count is capped', () => {
    const state = feed(...failures(CIRCUIT_OPENS_AFTER * 10));
    assert.equal(state.consecutiveFailures, CIRCUIT_OPENS_AFTER);
  });
});

describe('netinfo', () => {
  test('losing the link goes offline immediately, without waiting for failures', () => {
    const state = feed({ type: 'netinfo-changed', online: false });
    assert.equal(statusOf(state), 'offline');
  });

  test('regaining the link resets the streak so the API gets an immediate chance', () => {
    const state = feed(
      ...failures(CIRCUIT_OPENS_AFTER),
      { type: 'netinfo-changed', online: false },
      { type: 'netinfo-changed', online: true },
    );
    assert.equal(state.consecutiveFailures, 0);
    assert.equal(state.circuitOpen, false);
    assert.equal(statusOf(state), 'online');
  });

  test('a network change while already connected does not clear the circuit', () => {
    // NetInfo reports every change to what it tracks, not just connectivity: a wifi to
    // cellular handoff arrives here as online:true with the link never having dropped.
    // Reading that as recovery would wake the queue onto an API we already know is not
    // answering, and burn a retry on every handoff.
    const state = feed(
      ...failures(CIRCUIT_OPENS_AFTER),
      { type: 'netinfo-changed', online: true },
    );

    assert.equal(state.circuitOpen, true);
    assert.equal(statusOf(state), 'offline');
  });

  test('a network change while already connected changes nothing at all', () => {
    const before = feed(...failures(UNSTABLE_AFTER));
    const after = reduceConnection(before, { type: 'netinfo-changed', online: true });

    assert.equal(after, before);
  });
});

describe('shouldProbe', () => {
  test('does not probe while healthy', () => {
    assert.equal(shouldProbe(initialConnectionState), false);
  });

  test('probes when the link is up but the API is not answering', () => {
    const state = feed(...failures(CIRCUIT_OPENS_AFTER));
    assert.equal(shouldProbe(state), true);
  });

  test('does not probe with no link at all - netinfo will say when it returns', () => {
    const state = feed(...failures(CIRCUIT_OPENS_AFTER), {
      type: 'netinfo-changed',
      online: false,
    });
    assert.equal(shouldProbe(state), false);
  });

  test('does not probe while offline is simulated', () => {
    const state = feed(...failures(CIRCUIT_OPENS_AFTER), {
      type: 'forced-offline',
      value: true,
    });
    assert.equal(shouldProbe(state), false);
  });

  test('a successful probe closes the circuit and stops further probing', () => {
    const state = feed(...failures(CIRCUIT_OPENS_AFTER), { type: 'probe-succeeded' });
    assert.equal(statusOf(state), 'online');
    assert.equal(shouldProbe(state), false);
  });
});

describe('simulated offline', () => {
  test('overrides a perfectly healthy connection', () => {
    const state = feed({ type: 'forced-offline', value: true });
    assert.equal(statusOf(state), 'offline');
  });

  test('turning it back off recovers even if the circuit had opened', () => {
    const state = feed(
      { type: 'forced-offline', value: true },
      ...failures(CIRCUIT_OPENS_AFTER),
      { type: 'forced-offline', value: false },
    );
    assert.equal(statusOf(state), 'online');
  });
});

describe('a flaky connection, end to end', () => {
  test('warns, gives up, then recovers on the probe', () => {
    let state = initialConnectionState;
    const seen: string[] = [];

    const step = (event: ConnectionEvent) => {
      state = reduceConnection(state, event);
      seen.push(statusOf(state));
    };

    failures(CIRCUIT_OPENS_AFTER).forEach(step);
    step({ type: 'probe-succeeded' });

    assert.deepEqual(seen, ['online', 'online', 'unstable', 'unstable', 'offline', 'online']);
  });
});
