import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAuthService } from './google-auth.service';
import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthService } from './auth.service';

/**
 * Phase 21.2 — Unit tests for Google Sign-In.
 *
 * Stub global `fetch` to mock Google's tokeninfo endpoint; stub
 * `prisma.user` + `auth.toAuthResponse` to keep the test in-memory.
 *
 * Covered cases:
 *   1. Happy path — tokeninfo OK + new user provisioning.
 *   2. Existing Google user — profile snapshot refresh.
 *   3. Existing EMAIL-auth user with same verified email → LINK Google to it.
 *   4. Invalid id_token — tokeninfo returns 400 + error.
 *   5. Missing GOOGLE_CLIENT_ID env var — surfaces as 500.
 *   6. Audience mismatch — surfaces as 401.
 *   7. Issuer not allowed — surfaces as 401.
 *   8. email_verified=false → rejected.
 *   9. Soft-deleted account — blocks login.
 */

const FAKE_CLIENT_ID =
  '1234567890-abcdefg.apps.googleusercontent.com';
const FAKE_GOOGLE_SUB = '109876543210987654321';
const FAKE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

interface MockUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
  googleUserId: string | null;
  lineUserId: string | null;
  deletionRequestedAt: Date | null;
  deletionPurgeAt: Date | null;
}

function makeUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: 'u_test',
    email: null,
    phone: null,
    name: 'Test',
    role: 'CUSTOMER',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    googleUserId: FAKE_GOOGLE_SUB,
    lineUserId: null,
    deletionRequestedAt: null,
    deletionPurgeAt: null,
    ...overrides,
  };
}

function makeService(opts: {
  findUniqueByGoogleId?: MockUser | null;
  findUniqueByEmail?: MockUser | null;
  createUser?: MockUser;
  updateUser?: MockUser;
  verifyResponse?: { status: number; body: unknown };
  clientId?: string | null;
}) {
  if (opts.clientId === null) {
    delete process.env.GOOGLE_CLIENT_ID;
  } else {
    process.env.GOOGLE_CLIENT_ID = opts.clientId ?? FAKE_CLIENT_ID;
  }
  process.env.GOOGLE_TOKENINFO_ENDPOINT = FAKE_TOKENINFO_URL;

  const verify = opts.verifyResponse ?? {
    status: 200,
    body: {
      iss: 'https://accounts.google.com',
      sub: FAKE_GOOGLE_SUB,
      aud: FAKE_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: 'somchai@example.com',
      email_verified: 'true',
      name: 'Somchai Test',
      picture: 'https://lh3.googleusercontent.com/abc',
    },
  };

  const fetchMock = vi.fn().mockResolvedValue({
    ok: verify.status >= 200 && verify.status < 300,
    status: verify.status,
    json: async () => verify.body,
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);

  const prisma = {
    user: {
      findUnique: vi
        .fn()
        .mockImplementation(
          (args: { where: { googleUserId?: string; email?: string } }) => {
            if (args.where.googleUserId !== undefined) {
              return Promise.resolve(opts.findUniqueByGoogleId ?? null);
            }
            if (args.where.email !== undefined) {
              return Promise.resolve(opts.findUniqueByEmail ?? null);
            }
            return Promise.resolve(null);
          },
        ),
      create: vi.fn().mockResolvedValue(
        opts.createUser ?? makeUser({ id: 'u_new', email: 'somchai@example.com' }),
      ),
      update: vi
        .fn()
        .mockResolvedValue(opts.updateUser ?? makeUser({ id: 'u_existing' })),
    },
  } as unknown as PrismaService;

  const auth = {
    issueRefreshToken: vi
      .fn()
      .mockResolvedValue({ id: 'rt_1', plaintext: 'rt-plain', expiresAt: new Date() }),
    toAuthResponse: vi.fn().mockImplementation((u: MockUser) => ({
      user: {
        id: u.id,
        email: u.email,
        phone: u.phone,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt.toISOString(),
      },
      accessToken: 'access-token-stub',
      refreshToken: 'rt-plain',
      expiresInSec: 3600,
    })),
  } as unknown as AuthService;

  return {
    service: new GoogleAuthService(prisma, auth),
    prisma,
    auth,
    fetchMock,
  };
}

describe('GoogleAuthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_CLIENT_ID = FAKE_CLIENT_ID;
    process.env.GOOGLE_TOKENINFO_ENDPOINT = FAKE_TOKENINFO_URL;
  });

  it('happy path — new Google user provisioned + AuthResponse returned', async () => {
    const { service, prisma, auth, fetchMock } = makeService({
      findUniqueByGoogleId: null,
      findUniqueByEmail: null,
    });

    const res = await service.login({ idToken: 'id-token-stub' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('id_token=id-token-stub');
    expect(init.method).toBe('GET');

    expect(prisma.user.create).toHaveBeenCalledOnce();
    const createArgs = (prisma.user.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(createArgs.data).toMatchObject({
      authProvider: 'GOOGLE',
      googleUserId: FAKE_GOOGLE_SUB,
      googleDisplayName: 'Somchai Test',
      googlePictureUrl: 'https://lh3.googleusercontent.com/abc',
      email: 'somchai@example.com',
      passwordHash: null,
    });

    expect(auth.issueRefreshToken).toHaveBeenCalled();
    expect(res.accessToken).toBe('access-token-stub');
  });

  it('existing Google user — refreshes Google profile snapshot on each login', async () => {
    const existing = makeUser({ id: 'u_existing', email: 'old@stored.local' });
    const { service, prisma } = makeService({
      findUniqueByGoogleId: existing,
    });

    await service.login({ idToken: 'id-token-stub' });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledOnce();
    const updateArgs = (prisma.user.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'u_existing' });
    expect(updateArgs.data).toEqual({
      googleDisplayName: 'Somchai Test',
      googlePictureUrl: 'https://lh3.googleusercontent.com/abc',
    });
  });

  it('links Google to an existing EMAIL-auth account with matching verified email', async () => {
    const emailUser = makeUser({
      id: 'u_email_owner',
      email: 'somchai@example.com',
      googleUserId: null,
    });
    const { service, prisma } = makeService({
      findUniqueByGoogleId: null,
      findUniqueByEmail: emailUser,
      updateUser: { ...emailUser, googleUserId: FAKE_GOOGLE_SUB },
    });

    await service.login({ idToken: 'id-token-stub' });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledOnce();
    const updateArgs = (prisma.user.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'u_email_owner' });
    expect(updateArgs.data).toMatchObject({
      googleUserId: FAKE_GOOGLE_SUB,
      googleDisplayName: 'Somchai Test',
      googlePictureUrl: 'https://lh3.googleusercontent.com/abc',
    });
  });

  it('rejects invalid id_token (tokeninfo returns 400)', async () => {
    const { service } = makeService({
      verifyResponse: {
        status: 400,
        body: {
          error: 'invalid_token',
          error_description: 'Invalid Value',
        },
      },
    });

    await expect(service.login({ idToken: 'bad' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('surfaces 500 when GOOGLE_CLIENT_ID is missing', async () => {
    const { service } = makeService({ clientId: null });

    await expect(service.login({ idToken: 'x' })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('blocks audience mismatch (token issued for a different app)', async () => {
    const { service } = makeService({
      verifyResponse: {
        status: 200,
        body: {
          iss: 'https://accounts.google.com',
          sub: FAKE_GOOGLE_SUB,
          aud: 'wrong-client.apps.googleusercontent.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          email: 'x@x.com',
          email_verified: 'true',
        },
      },
    });

    await expect(service.login({ idToken: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('blocks unknown issuer', async () => {
    const { service } = makeService({
      verifyResponse: {
        status: 200,
        body: {
          iss: 'https://evil.example.com',
          sub: FAKE_GOOGLE_SUB,
          aud: FAKE_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          email: 'x@x.com',
          email_verified: 'true',
        },
      },
    });

    await expect(service.login({ idToken: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when email_verified is false', async () => {
    const { service } = makeService({
      verifyResponse: {
        status: 200,
        body: {
          iss: 'https://accounts.google.com',
          sub: FAKE_GOOGLE_SUB,
          aud: FAKE_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          email: 'unverified@example.com',
          email_verified: 'false',
        },
      },
    });

    await expect(service.login({ idToken: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('blocks login when the matched account is pending deletion', async () => {
    const pending = makeUser({
      id: 'u_pending',
      deletionRequestedAt: new Date('2026-05-01T00:00:00Z'),
      deletionPurgeAt: new Date('2026-06-01T00:00:00Z'),
    });
    const { service } = makeService({ findUniqueByGoogleId: pending });

    await expect(service.login({ idToken: 'x' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_DELETION_PENDING' }),
    });
  });
});
