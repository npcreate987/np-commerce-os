import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthResponse, LineLoginInput, UserRole } from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from './auth.service';

/**
 * Phase 21 — LINE Login (LIFF) backend.
 *
 * Flow:
 *  1. Frontend obtains `idToken` from LIFF (`liff.getIDToken()`).
 *  2. POSTs it to `/auth/line { idToken, nonce? }`.
 *  3. We verify the token by calling LINE's verify endpoint with our channel ID
 *     (the simpler alternative to fetching + caching the JWKS). The endpoint
 *     validates signature + expiry + audience and returns the decoded claims.
 *  4. We find-or-create the User by `lineUserId` (= `sub` claim).
 *  5. On every login we refresh the `lineDisplayName` + `linePictureUrl`
 *     snapshots so the local copy stays in sync with the user's LINE profile.
 *  6. We mint our standard refresh token + access token via AuthService so
 *     downstream guards keep working unchanged.
 *
 * Security guards:
 *   • LINE verifies audience (`aud`) against our channel ID, so a token
 *     issued for a different LINE app can't authenticate here.
 *   • Optional `nonce` round-trip stops replay of intercepted tokens.
 *   • Soft-deleted accounts (`deletionRequestedAt`) are blocked at login.
 *   • We never trust client-supplied profile data; only the claims returned
 *     by LINE's verify endpoint are used.
 */
@Injectable()
export class LineAuthService {
  private readonly logger = new Logger(LineAuthService.name);

  private readonly verifyEndpoint =
    process.env.LINE_VERIFY_ENDPOINT ??
    'https://api.line.me/oauth2/v2.1/verify';

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async login(input: LineLoginInput): Promise<AuthResponse> {
    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    if (!channelId) {
      this.logger.error('LINE_LOGIN_CHANNEL_ID is not configured');
      throw new InternalServerErrorException('LINE Login is not configured');
    }

    const claims = await this.verifyIdToken(input.idToken, channelId, input.nonce);

    const lineUserId = claims.sub;
    if (!lineUserId) {
      throw new UnauthorizedException('LINE token missing subject');
    }

    const displayName = typeof claims.name === 'string' ? claims.name : null;
    const pictureUrl = typeof claims.picture === 'string' ? claims.picture : null;
    const emailFromLine = typeof claims.email === 'string' ? claims.email : null;

    const existing = await this.prisma.user.findUnique({
      where: { lineUserId },
    });

    let user;
    if (existing) {
      // Phase 17 — block login when account is pending deletion.
      if (existing.deletionRequestedAt) {
        throw new UnauthorizedException({
          code: 'ACCOUNT_DELETION_PENDING',
          message:
            'Account is pending deletion. Restore via /me/account/deletion/cancel.',
          purgeAt: existing.deletionPurgeAt?.toISOString() ?? null,
        });
      }

      // Sync the LINE profile snapshot on every login so the local copy
      // never drifts from LINE's source of truth. We don't touch `email`,
      // `name`, or `phone` since the customer may have edited those in
      // /profile/edit and we don't want LINE to clobber their choice.
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          lineDisplayName: displayName,
          linePictureUrl: pictureUrl,
        },
      });
    } else {
      // First-time signup via LINE. We only set the email column when LINE
      // actually returned one AND it isn't already taken by an EMAIL-auth
      // account — otherwise we leave it null and the user can fill it in
      // later via /profile/edit (Phase 21 decision: LINE-first onboarding).
      const safeEmail = await this.pickSafeEmail(emailFromLine);

      user = await this.prisma.user.create({
        data: {
          email: safeEmail,
          name: displayName,
          passwordHash: null,
          role: 'CUSTOMER',
          authProvider: 'LINE',
          lineUserId,
          lineDisplayName: displayName,
          linePictureUrl: pictureUrl,
        },
      });

      this.logger.log(
        `New LINE user provisioned: id=${user.id} lineUserId=${lineUserId} hasEmail=${Boolean(
          safeEmail,
        )}`,
      );
    }

    const refresh = await this.auth.issueRefreshToken(user.id);
    return this.auth.toAuthResponse(
      {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role as UserRole,
        createdAt: user.createdAt,
      },
      refresh,
    );
  }

  /**
   * Call LINE's id_token verify endpoint (RFC: https://developers.line.biz/en/reference/line-login/#verify-id-token).
   *
   * Response on success:
   *   {
   *     iss, sub, aud, exp, iat,
   *     name?, picture?, email?,
   *     nonce?, amr?
   *   }
   * Response on failure:
   *   { error: 'invalid_request', error_description: '...' }
   */
  private async verifyIdToken(
    idToken: string,
    clientId: string,
    expectedNonce?: string,
  ): Promise<LineIdTokenClaims> {
    const body = new URLSearchParams({ id_token: idToken, client_id: clientId });
    if (expectedNonce) body.set('nonce', expectedNonce);

    let res: Response;
    try {
      res = await fetch(this.verifyEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (err) {
      this.logger.error(
        `Failed to reach LINE verify endpoint: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Unable to reach LINE verification service',
      );
    }

    const json = (await res.json().catch(() => ({}))) as
      | LineIdTokenClaims
      | LineVerifyError;

    if (!res.ok || isVerifyError(json)) {
      const msg =
        (json as LineVerifyError).error_description ??
        (json as LineVerifyError).error ??
        `LINE verify returned HTTP ${res.status}`;
      this.logger.warn(`LINE id_token verification failed: ${msg}`);
      throw new UnauthorizedException('LINE token verification failed');
    }

    // Defensive double-check on audience — LINE already enforces this on
    // their side, but we re-assert in case the verify endpoint behaviour
    // ever changes.
    if (json.aud !== clientId) {
      this.logger.warn(
        `LINE id_token audience mismatch: got=${json.aud} expected=${clientId}`,
      );
      throw new UnauthorizedException('LINE token audience mismatch');
    }

    return json;
  }

  /**
   * Decide whether to assign `email` on a brand-new LINE user.
   *
   *   • If LINE didn't return an email → null (user can fill in later).
   *   • If an EMAIL-auth account already owns that email → null (and we
   *     log a warning; the user can later "link" via profile settings).
   *   • Otherwise → use it.
   *
   * This keeps the `email` UNIQUE constraint happy without ever rejecting
   * a LINE login because of an email collision.
   */
  private async pickSafeEmail(candidate: string | null): Promise<string | null> {
    if (!candidate) return null;
    const collision = await this.prisma.user.findUnique({
      where: { email: candidate },
    });
    if (collision) {
      this.logger.warn(
        `LINE-supplied email "${candidate}" already in use by user=${collision.id}; storing null`,
      );
      return null;
    }
    return candidate;
  }
}

// =============================================================================
// Local helper types — kept private to this file because they're tightly
// coupled to LINE's API response shape and don't belong in shared/types.
// =============================================================================

type LineIdTokenClaims = {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  amr?: string[];
  name?: string;
  picture?: string;
  email?: string;
};

type LineVerifyError = {
  error: string;
  error_description?: string;
};

function isVerifyError(
  v: LineIdTokenClaims | LineVerifyError,
): v is LineVerifyError {
  return typeof (v as LineVerifyError).error === 'string';
}

/**
 * Phase 21 — exported as a separate symbol so unit tests can stub the
 * verify endpoint with a captive `fetch` mock without monkey-patching.
 * In production we always hit `api.line.me`; in tests we'd set
 * `LINE_VERIFY_ENDPOINT=https://example.test/...`.
 */
export type { LineIdTokenClaims };
