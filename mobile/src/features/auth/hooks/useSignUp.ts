import { useMutation } from '@tanstack/react-query';
import { authMutationOptions } from '../../../auth/authMutationOptions';
import { signUp } from '../../../auth/cognito';

type Args = { email: string; password: string; name: string };

export const useSignUp = () =>
  useMutation({
    mutationFn: ({ email, password, name }: Args) => signUp(email, password, name),
    ...authMutationOptions,
  });
