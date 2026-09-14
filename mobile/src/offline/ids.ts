import { getRandomBytes } from 'expo-crypto';
import { v7 as uuidv7 } from 'uuid';

/// Mints entity ids on the client rather than waiting for the server to name them, so a
/// write can be composed offline, shown straight away, navigated into, and retried until
/// it lands - all before the API has heard of it.
///
/// Version 7 rather than 4 because the leading 48 bits are a timestamp: rows written
/// close together in time land close together in the index, instead of scattering across
/// the B-tree the way random uuids do.
///
/// React Native ships no global crypto.getRandomValues, so the randomness comes from
/// expo-crypto rather than from a polyfill installed to satisfy uuid's default. The
/// monotonic counter RFC 9562 asks for within a single millisecond stays uuid's job.
export const newId = (): string => uuidv7({ rng: () => getRandomBytes(16) });
