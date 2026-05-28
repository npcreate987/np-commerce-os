import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthResponse, GoogleLoginInput, UserRole } from '../../shared/types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from './auth.service';

/**
 * Phase 21.2 — Google Sign-In backend.
 *
 * Flow:
 *  1. Frontend obtains `idToken` from Google Identity Services
 *     (`google.accounts.id.initialize` → `prompt` → credential).
 *  2. POSTs it to `/auth/google { idToken, nonce? }`.
 *  3. We verify the token by calling Google's tokeninfo endpoint, which
 *     validates signature + expiry + audience and returns the decoded
 *     claims (alternative to fetching+caching the JWKS — same trade-off
 *     we made for LINE login).
 *  4. We find-or-create the User by `googleUserId` (= `sub` claim).
 *  5. On every login we refresh the `googleDisplayName` + `googlePictureUrl`
 *     snapshots so the local copy stays in sync with the user's Google
 *     profile.
 *  6. We mint our standard refresh token + access token via AuthService so
 *     downstream guards keep working unchanged.
 *
 * Security guards:
 *   • Audience check: token must be issued for OUR Google OAuth Client ID.
 *     Without this, any Google id_token from any app could authenticate
 *     here — catastrophic.
 *   • Issuer check: must be `accounts.google.com` or `https://accounts.google.com`.
 *   • Optional nonce round-trip stops replay of intercepted tokens.
 *   • Soft-deleted accounts (`deletionRequestedAt`) are blocked at login.
 *   • `email_verified` is required — Google lets users add unverified emails,
 *     and we don't want to inherit that trust.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  private readonly tokenInfoEndpoint =
    process.env.GOOGLE_TOKENINFO_ENDPOINT ??
    'https://oauth2.googleapis.com/tokeninfo';

  private readonly allowedIssuers = new Set([
    'accounts.google.com',
    'https://accounts.google.com',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async login(input: GoogleLoginInput): Promise<AuthResponse> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      this.logger.error('GOOGLE_CLIENT_ID is not configured');
      throw new InternalServerErrorException(
        'Google Sign-In is not configured',
      );
    }

    const claims = await this.verifyIdToken(input.idToken, clientId, input.nonce);

    const googleUserId = claims.sub;
    if (!googleUserId) {
      throw new UnauthorizedException('Google token missing subject');
    }

    if (claims.email_verified !== 'true' && claims.email_verified !== true) {
      this.logger.warn(
        `Google login rejected — email_verified=${claims.email_verified} for sub=${googleUserId}`,
      );
      throw new UnauthorizedException(
        'Google account email is not verified',
      );
    }

    const displayName =
      (typeof claims.name === 'string' && claims.name) ||
      (typeof claims.given_name === 'string' ? claims.given_name : null);
    const pictureUrl = typeof claims.picture === 'string' ? claims.picture : null;
    const emailFromGoogle = typeof claims.email === 'string' ? claims.email : null;

    const existing = await this.prisma.user.findUnique({
      where: { googleUserId },
    });

    let user;
    if (existing) {
      if (existing.deletionRequestedAt) {
        throw new UnauthorizedException({
          code: 'ACCOUNT_DELETION_PENDING',
          message:
            'Account is pending deletion. Restore via /me/account/deletion/cancel.',
          purgeAt: existing.deletionPurgeAt?.toISOString() ?? null,
        });
      }

      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          googleDisplayName: displayName,
          googlePictureUrl: pictureUrl,
        },
      });
    } else {
      // First-time Google signup. If Google's verified email matches an
      // existing EMAIL-auth account, we LINK rather than collide — the user
      // signed up with the same email before, so it's almost certainly the
      // same person. This preserves their orders/wallet/etc.
      if (emailFromGoogle) {
        const emailOwner = await this.prisma.user.findUnique({
          where: { email: emailFromGoogle },
        });

        if (emailOwner) {
          if (emailOwner.deletionRequestedAt) {
            throw new UnauthorizedException({
              code: 'ACCOUNT_DELETION_PENDING',
              message:
                'Account is pending deletion. Restore via /me/account/deletion/cancel.',
              purgeAt: emailOwner.deletionPurgeAt?.toISOString() ?? null,
            });
          }

          // Link Google to the existing email-auth user.
          user = await this.prisma.user.update({
            where: { id: emailOwner.id },
            data: {
              googleUserId,
              googleDisplayName: displayName,
              googlePictureUrl: pictureUrl,
            },
          });

          this.logger.log(
            `Linked Google to existing account: id=${emailOwner.id} sub=${googleUserId} email=${emailFromGoogle}`,
          );

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
      }

      user = await this.prisma.user.create({
        data: {
          email: emailFromGoogle,
          name: displayName,
          passwordHash: null,
          role: 'CUSTOMER',
          authProvider: 'GOOGLE',
          googleUserId,
          googleDisplayName: displayName,
          googlePictureUrl: pictureUrl,
        },
      });

      this.logger.log(
        `New Google user provisioned: id=${user.id} googleUserId=${googleUserId} hasEmail=${Boolean(
          emailFromGoogle,
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
   * Call Google's tokeninfo endpoint (https://oauth2.googleapis.com/tokeninfo?id_token=...).
   *
   * Response on success: signed payload as a JSON object including
   *   { iss, sub, aud, exp, iat, email?, email_verified?, name?, picture? }
   * Response on failure: HTTP 400 with `{ error, error_description }`.
   */
  private async verifyIdToken(
    idToken: string,
    clientId: string,
    expectedNonce?: string,
  ): Promise<GoogleIdTokenClaims> {
    const url = `${this.tokenInfoEndpoint}?id_token=${encodeURIComponent(idToken)}`;

    let res: Response;
    try {
      res = await fetch(url, { method: 'GET' });
    } catch (err) {
      this.logger.error(
        `Failed to reach Google tokeninfo endpoint: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Unable to reach Google verification service',
      );
    }

    const json = (await res.json().catch(() => ({}))) as
      | GoogleIdTokenClaims
      | GoogleVerifyError;

    if (!res.ok || isVerifyError(json)) {
      const msg =
        (json as GoogleVerifyError).error_description ??
        (json as GoogleVerifyError).error ??
        `Google tokeninfo returned HTTP ${res.status}`;
      this.logger.warn(`Google id_token verification failed: ${msg}`);
      throw new UnauthorizedException('Google token verification failed');
    }

    // Audience check — critical. Any Google id_token from any app could be
    // posted to us, so we MUST refuse anything not minted for our client.
    if (json.aud !== clientId) {
      this.logger.warn(
        `Google id_token audience mismatch: got=${json.aud} expected=${clientId}`,
      );
      throw new UnauthorizedException('Google token audience mismatch');
    }

    // Issuer check — defence-in-depth.
    if (!this.allowedIssuers.has(json.iss)) {
      this.logger.warn(`Google id_token issuer not allowed: ${json.iss}`);
      throw new UnauthorizedException('Google token issuer mismatch');
    }

    // Expiry check — tokeninfo returns expired tokens with an `error` field,
    // so we shouldn't reach here, but belt-and-braces.
    const exp = Number(json.exp);
    if (Number.isFinite(exp) && exp * 1000 < Date.now()) {
      this.logger.warn(`Google id_token expired: exp=${json.exp}`);
      throw new UnauthorizedException('Google token expired');
    }

    // Nonce binding — only enforce when caller passed one.
    if (expectedNonce && json.nonce && json.nonce !== expectedNonce) {
      this.logger.warn('Google id_token nonce mismatch');
      throw new UnauthorizedException('Google token nonce mismatch');
    }

    return json;
  }
}

// =============================================================================
// Local helper types — kept private to this file because they're tightly
// coupled to Google's tokeninfo response shape.
// =============================================================================

/**
 * Google's tokeninfo endpoint serializes all values as JSON, but numeric
 * timestamps and `email_verified` come back as strings ("1700000000",
 * "true") — JWT spec says they're numbers/booleans, but Google's REST
 * surface flattens them. We accept both forms in the type.
 */
type GoogleIdTokenClaims = {
  iss: string;
  sub: string;
  aud: string;
  exp: number | string;
  iat: number | string;
  nonce?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean | string;
};

type GoogleVerifyError = {
  error: string;
  error_description?: string;
};

function isVerifyError(
  v: GoogleIdTokenClaims | GoogleVerifyError,
): v is GoogleVerifyError {
  return typeof (v as GoogleVerifyError).error === 'string';
}

export type { GoogleIdTokenClaims };
