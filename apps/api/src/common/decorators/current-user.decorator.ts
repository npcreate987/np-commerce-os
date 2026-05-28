import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UserRole } from '../../shared/types';

export interface AuthenticatedUser {
  userId: string;
  /// Nullable since Phase 21 — LINE-only accounts may not have an email.
  email: string | null;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return req.user;
  },
);
