import { UseMutationOptions } from '@tanstack/react-query';

/// Signing in is not a write that can wait.
///
/// The defaults in queryClient.ts are built for writes that belong to the user's data:
/// they pause without a connection, queue behind one another in a single scope, and are
/// retried for as long as it takes. Every one of those is wrong here. A sign-in that
/// pauses leaves a button spinning with nothing to explain it; a sign-in that queues waits
/// on writes belonging to a session that does not exist yet; and a rejected password is
/// not worth retrying.
///
/// So these opt out: run regardless of what the connection is believed to be, on their
/// own, once - and let the screen show whatever comes back.
export const authMutationOptions = {
  networkMode: 'always',
  retry: false,
  scope: undefined,
} satisfies Partial<UseMutationOptions<unknown, unknown, never, unknown>>;
