import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Allows only users with role === 'ADMIN'. Must be combined with JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user || req.user.role !== 'ADMIN') {
      throw new ForbiddenException('ต้องเป็น Admin เท่านั้น');
    }
    return true;
  }
}
