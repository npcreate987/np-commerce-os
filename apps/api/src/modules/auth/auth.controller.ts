import { Body, Controller, Get, Post, UseGuards, UsePipes } from '@nestjs/common';
import {
  AuthResponse,
  LineLoginInput,
  LoginInput,
  SignupInput,
  lineLoginSchema,
  loginSchema,
  signupSchema,
} from '../../shared/types';
import { ZodValidationPipe } from '../../common/zod/zod-validation.pipe';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle } from '../../common/throttle/throttler';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { LineAuthService } from './line-auth.service';
import { z } from 'zod';

const refreshSchema = z.object({ refreshToken: z.string().min(20).max(400) });
type RefreshInput = z.infer<typeof refreshSchema>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly lineAuth: LineAuthService,
  ) {}

  // Phase 13.3a — 5 signups / minute per IP. Tight enough that automated
  // account farming is impractical, loose enough that 4 family members
  // signing up from one café Wi-Fi still works.
  @Post('signup')
  @Throttle({ windowSec: 60, max: 5 })
  @UsePipes(new ZodValidationPipe(signupSchema))
  signup(@Body() body: SignupInput): Promise<AuthResponse> {
    return this.auth.signup(body);
  }

  // 10 logins / minute, keyed by (IP, email) so a brute-force on one account
  // doesn't lock the whole IP and vice versa.
  @Post('login')
  @Throttle({ windowSec: 60, max: 10, keyBy: 'ip+body.email' })
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput): Promise<AuthResponse> {
    return this.auth.login(body);
  }

  // Phase 13.3b — Issue a fresh access token from a still-valid refresh token.
  // Rotates the refresh token (single-use) so a stolen token has limited reuse
  // window: ≤ rotation grace (60s, see refreshAccessToken).
  @Post('refresh')
  @Throttle({ windowSec: 60, max: 30 })
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() body: RefreshInput): Promise<AuthResponse> {
    return this.auth.refreshAccessToken(body.refreshToken);
  }

  // Phase 21 — LINE Login. Client passes the `idToken` it got from LIFF
  // (`liff.getIDToken()`); we verify it with LINE then issue our usual
  // session. 20/min/IP is plenty for honest retries while still blocking
  // brute-force scans on the verify endpoint.
  @Post('line')
  @Throttle({ windowSec: 60, max: 20 })
  @UsePipes(new ZodValidationPipe(lineLoginSchema))
  line(@Body() body: LineLoginInput): Promise<AuthResponse> {
    return this.lineAuth.login(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
