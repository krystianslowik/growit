import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/// Delays a write until the user stops typing, without losing it if they leave first.
///
/// The obvious version - a timer cleared on cleanup - quietly drops the edit whenever the
/// screen unmounts inside the debounce window. Renaming a plan and hitting back within
/// the delay was doing exactly that: no request, no error, the change simply gone. So the
/// pending write is flushed on the way out instead of cancelled, and again when the OS
/// takes the app away, which is the last moment we are sure to get.
export const useDebouncedWrite = <TPayload>(
  write: (payload: TPayload) => void,
  delayMs: number,
) => {
  // Held in a ref so a re-rendered caller does not restart the timer or the subscription.
  const writeRef = useRef(write);
  writeRef.current = write;

  const pendingRef = useRef<TPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const flush = useCallback(() => {
    stopTimer();

    const pending = pendingRef.current;
    if (pending === null) return;

    pendingRef.current = null;
    writeRef.current(pending);
  }, []);

  /// For when the value comes back to what it already was: the edit is void, and the
  /// write that was waiting for it would otherwise still land.
  const cancel = useCallback(() => {
    stopTimer();
    pendingRef.current = null;
  }, []);

  const schedule = useCallback(
    (payload: TPayload) => {
      pendingRef.current = payload;
      stopTimer();
      timerRef.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') flush();
    });

    return () => {
      subscription.remove();
      flush();
    };
  }, [flush]);

  return { schedule, cancel };
};
