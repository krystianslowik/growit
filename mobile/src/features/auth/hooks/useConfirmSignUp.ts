import { useMutation } from '@tanstack/react-query';
import { authMutationOptions } from '../../../auth/authMutationOptions';
import { confirmSignUp } from '../../../auth/cognito';

type Args = { email: string; code: string };

export const useConfirmSignUp = () =>
  useMutation({
    mutationFn: ({ email, code }: Args) => confirmSignUp(email, code),
    ...authMutationOptions,
  });
