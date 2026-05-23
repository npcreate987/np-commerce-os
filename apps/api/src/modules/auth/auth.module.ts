import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me',
      // Phase 13.3b — shorter access-token lifetime now that we have refresh
      // tokens. 7d → 1h means a stolen JWT expires fast; clients call
      // `/v1/auth/refresh` (uses the refresh token) to mint a new one.
      // Override via `JWT_ACCESS_TTL` (any zeit/ms string e.g. `15m`, `2h`).
      signOptions: { expiresIn: process.env.JWT_ACCESS_TTL ?? '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
