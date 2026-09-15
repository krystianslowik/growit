// Owns the session: who is signed in, and the tokens backing it.
// Stateless Cognito calls (sign-up, confirmation) live in features/auth/hooks instead.

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { signIn as cognitoSignIn, revokeRefreshToken, Session } from './cognito';
import { saveSession, loadSession, clearSession } from './tokenStorage';
import { setSessionExpiredHandler } from './sessionExpiry';
import { persistPendingWrites } from '../offline/pendingWrites';

type AuthState = {
  isBootstrapping: boolean;
  isAuthed: boolean;
  userId: string | null;
  name: string | null;
  email: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .finally(() => setIsBootstrapping(false));
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Nothing is cleared here any more. queryClient.clear() empties the mutation cache
      // as well as the query cache, and this path fires exactly when that cache is at its
      // fullest - a session expiring is usually a session that has been offline. The
      // queue is written to disk instead, and the next sign-in as the same user picks it
      // back up; isolation between accounts comes from the per-user client in QueryLayer.
      void persistPendingWrites();
      setSession(null);
      void clearSession();
    });

    return () => setSessionExpiredHandler(null);
  }, []);

  const signIn = async (email: string, password: string) => {
    const next = await cognitoSignIn(email, password);
    await saveSession(next);
    setSession(next);
  };

  const signOut = async () => {
    const current = session;

    // Flush before the client goes away: persistence is throttled, so the last write or
    // two may only exist in memory. They stay under this user's key and are picked up
    // when they sign back in.
    await persistPendingWrites();

    // Drop the session first: the user asked to leave, and a failure further down must
    // not leave them stuck inside. The next account gets a client of its own, so there
    // is nothing here to clear.
    setSession(null);

    try {
      await clearSession();
      // Best effort: invalidating the token server-side is worth doing, but the
      // user is already out either way, so a network failure changes nothing.
      if (current) await revokeRefreshToken(current.tokens.refreshToken);
    } catch (err) {
      console.error('Sign-out cleanup failed', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isBootstrapping,
        isAuthed: session !== null,
        userId: session?.userId ?? null,
        name: session?.name ?? null,
        email: session?.email ?? null,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const useUserId = (): string => {
  const { userId } = useAuth();
  if (!userId) throw new Error('useUserId used outside an authenticated screen');
  return userId;
};
