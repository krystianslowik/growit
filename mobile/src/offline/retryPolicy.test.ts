/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MAX_SERVER_ERROR_RETRIES,
  MAX_TRANSPORT_RETRIES,
  shouldRetryWrite,
} from './retryPolicy.ts';

const responded = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });

const neverLanded = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

describe('shouldRetryWrite', () => {
  test('gives up at once on anything the server will refuse again', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      assert.equal(shouldRetryWrite(0, responded(status)), false, `status ${status}`);
    }
  });

  test('keeps retrying a request that never landed', () => {
    // These belong to the circuit breaker: it will flip the app offline and pause the
    // write. A write about to be paused must not also be running out of attempts - that
    // was how queued writes were being dropped while the user was simply out of signal.
    assert.equal(shouldRetryWrite(0, neverLanded()), true);
    assert.equal(shouldRetryWrite(MAX_SERVER_ERROR_RETRIES + 1, neverLanded()), true);
    assert.equal(shouldRetryWrite(MAX_TRANSPORT_RETRIES - 1, neverLanded()), true);
  });

  test('stops eventually even on transport failures, so nothing spins forever', () => {
    assert.equal(shouldRetryWrite(MAX_TRANSPORT_RETRIES, neverLanded()), false);
  });

  test('has much less patience for a server that answers badly', () => {
    assert.equal(shouldRetryWrite(0, responded(500)), true);
    assert.equal(shouldRetryWrite(MAX_SERVER_ERROR_RETRIES - 1, responded(503)), true);
    assert.equal(shouldRetryWrite(MAX_SERVER_ERROR_RETRIES, responded(500)), false);
  });

  test('treats 408 and 429 as worth another try, not as refusals', () => {
    assert.equal(shouldRetryWrite(0, responded(408)), true);
    assert.equal(shouldRetryWrite(0, responded(429)), true);
  });
});
