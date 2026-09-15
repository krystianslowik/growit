/// Counts writes that ran out of road: refused by the server, or retried until the budget
/// was gone. They matter because the optimistic patch that went with them is still sitting
/// in the cache, so without saying anything the app would go on showing the user data the
/// server never accepted.

let lost = 0;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const recordLostWrite = () => {
  lost += 1;
  notify();
};

export const clearLostWrites = () => {
  if (lost === 0) return;
  lost = 0;
  notify();
};

export const getLostWriteCount = () => lost;

export const subscribeToLostWrites = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
