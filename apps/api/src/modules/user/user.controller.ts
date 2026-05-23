import { Controller, Get, UseGuards } from '@nestjs/common';
import { User, UserRole } from '../../shared/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id: current.userId } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role as UserRole,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
