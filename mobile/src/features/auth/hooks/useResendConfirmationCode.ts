import { useMutation } from '@tanstack/react-query';
import { authMutationOptions } from '../../../auth/authMutationOptions';
import { resendConfirmationCode } from '../../../auth/cognito';

export const useResendConfirmationCode = () =>
  useMutation({
    mutationFn: (email: string) => resendConfirmationCode(email),
    ...authMutationOptions,
  });
