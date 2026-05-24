import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuthResponse, LoginInput, SignupInput, UserRole } from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Phase 13.3b — Refresh-token lifetime config.
 *
 *  • Access token lives `JWT_ACCESS_TTL` (default 1h, set in AuthModule)
 *  • Refresh token lives `REFRESH_TTL_DAYS` (default 30d)
 *  • Refresh tokens are SINGLE-USE and rotate on every `/auth/refresh` call.
 *    The previous token is left valid for `REFRESH_ROTATION_GRACE_SEC` (60s
 *    by default) so racing clients (two parallel API calls firing /refresh)
 *    don't lock each other out.
 */
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS ?? '30');
const REFRESH_ROTATION_GRACE_SEC = Number(
  process.env.REFRESH_ROTATION_GRACE_SEC ?? '60',
);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signup(input: SignupInput): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name ?? null,
        passwordHash,
        role: input.role ?? 'CUSTOMER',
      },
    });

    return this.toAuthResponse(user, await this.issueRefreshToken(user.id));
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Phase 17 — block login when account is pending deletion. Surface
    // a distinct error code so the web client can show the "restore
    // account?" flow instead of a generic credential error.
    if (user.deletionRequestedAt) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DELETION_PENDING',
        message: 'Account is pending deletion. Restore via /me/account/deletion/cancel.',
        purgeAt: user.deletionPurgeAt?.toISOString() ?? null,
      });
    }
    return this.toAuthResponse(user, await this.issueRefreshToken(user.id));
  }

  // ============================================================================
  // Phase 13.3b — Refresh token rotation.
  //
  // Flow:
  //   1. Hash the presented token (SHA-256) and look up an unrevoked row.
  //   2. Verify it hasn't expired.
  //   3. Mark the row revoked with a 60-second "rotated-grace" window — repeat
  //      callers within that window get the *same* successor token to dodge
  //      lost-update races.
  //   4. Mint a new refresh token (single-use) and a new short-lived access
  //      token bound to the same user.
  //
  // We store SHA-256 of the raw token (not bcrypt/argon2): we never need
  // password-style brute-force resistance for a 256-bit random value, and the
  // SHA-256 column is indexable for fast lookup.
  // ============================================================================
  async refreshAccessToken(presentedToken: string): Promise<AuthResponse> {
    const tokenHash = sha256Hex(presentedToken);

    type RefreshRow = {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: string;
      revokedAt: string | null;
      replacedById: string | null;
    };

    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT id, userId, tokenHash, expiresAt, revokedAt, replacedById
       FROM refresh_tokens
       WHERE tokenHash = ? LIMIT 1`,
      tokenHash,
    )) as RefreshRow[];

    const row = rows[0];
    if (!row) throw new UnauthorizedException('refresh token invalid');

    const now = Date.now();
    if (new Date(row.expiresAt).getTime() < now) {
      throw new UnauthorizedException('refresh token expired');
    }

    // Grace-period replay: client repeated the same refresh shortly after we
    // already rotated it. Honour the successor instead of failing — but only
    // inside `REFRESH_ROTATION_GRACE_SEC` of the revocation.
    if (row.revokedAt && row.replacedById) {
      const revokedAt = new Date(row.revokedAt).getTime();
      if (now - revokedAt < REFRESH_ROTATION_GRACE_SEC * 1000) {
        return this.followReplacement(row.userId, row.replacedById);
      }
      // Past the grace window — this is either a stale client or, more
      // worryingly, token theft. Revoke ALL sessions for this user as a
      // precaution and force re-login.
      await this.prisma.$executeRawUnsafe(
        `UPDATE refresh_tokens SET revokedAt = datetime('now'), revokeReason = 'reuse'
         WHERE userId = ? AND revokedAt IS NULL`,
        row.userId,
      );
      this.logger.warn(
        `refresh token reuse detected for user=${row.userId} — revoked all sessions`,
      );
      throw new UnauthorizedException('refresh token reused');
    }

    if (row.revokedAt) {
      throw new UnauthorizedException('refresh token revoked');
    }

    // Happy path — rotate.
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException('user not found');

    const next = await this.issueRefreshToken(row.userId);
    await this.prisma.$executeRawUnsafe(
      `UPDATE refresh_tokens
       SET revokedAt = datetime('now'), revokeReason = 'rotated', replacedById = ?
       WHERE id = ?`,
      next.id,
      row.id,
    );
    return this.toAuthResponse(user, next);
  }

  /** Look up a successor (created during grace-window rotation) and mint a fresh access token for it. */
  private async followReplacement(
    userId: string,
    replacementId: string,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('user not found');
    // We don't have the plaintext anymore; only the access token can be
    // reissued. Surface that the caller must use the new refresh token they
    // already received in the original rotation response by returning
    // `refreshToken: undefined` — clients should keep their stored one.
    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role as UserRole,
    });
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role as UserRole,
        createdAt: user.createdAt.toISOString(),
      },
      accessToken,
      // Intentionally omit refreshToken; client keeps the one from the
      // original rotation response.
      expiresInSec: accessTokenTtlSec(),
    };
    void replacementId; // explicit unused (kept for future audit trail)
  }

  /**
   * Issue a brand-new refresh token row.
   * Returns the inserted row id + the plaintext token (callers attach to
   * the AuthResponse — we never store the plaintext).
   */
  private async issueRefreshToken(
    userId: string,
  ): Promise<{ id: string; plaintext: string; expiresAt: Date }> {
    const plaintext = randomBytes(48).toString('base64url');
    const tokenHash = sha256Hex(plaintext);
    const id = `rt_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO refresh_tokens (id, userId, tokenHash, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      id,
      userId,
      tokenHash,
      expiresAt.toISOString(),
    );
    return { id, plaintext, expiresAt };
  }

  private toAuthResponse(
    user: {
      id: string;
      email: string;
      phone: string | null;
      name: string | null;
      role: string;
      createdAt: Date;
    },
    refresh: { plaintext: string },
  ): AuthResponse {
    const role = user.role as UserRole;
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role });
    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role,
        createdAt: user.createdAt.toISOString(),
      },
      accessToken,
      refreshToken: refresh.plaintext,
      expiresInSec: accessTokenTtlSec(),
    };
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function accessTokenTtlSec(): number {
  // We keep this dumb on purpose — the real source of truth is the JWT's exp.
  const raw = (process.env.JWT_ACCESS_TTL ?? '1h').trim();
  const m = /^(\d+)([smhd])$/.exec(raw);
  if (!m) return 3600;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default:  return 3600;
  }
}
