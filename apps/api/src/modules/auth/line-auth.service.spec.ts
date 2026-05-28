import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LineAuthService } from './line-auth.service';
import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthService } from './auth.service';

/**
 * Phase 21 — Unit tests for LINE Login.
 *
 * We stub the global `fetch` to mock LINE's verify endpoint and stub
 * `prisma.user` + `auth.toAuthResponse` to keep the test in-memory.
 *
 * Covered cases:
 *   1. Happy path — verify endpoint OK + new user provisioning.
 *   2. Existing user — profile snapshot refresh.
 *   3. Invalid id_token — verify endpoint returns 400 + error.
 *   4. Missing channel ID env var — surfaces as 500.
 *   5. Audience mismatch (defence-in-depth) — surfaces as 401.
 *   6. Soft-deleted account — blocks login with deletion code.
 *   7. Email collision with EMAIL-auth account — new LINE user stored with email=null.
 */

const FAKE_CHANNEL_ID = '1234567890';
const FAKE_LINE_USER_ID = 'U1111111111aaaaaaaaaaaaaaaaaaaaaa';
const FAKE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

interface MockUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: string;
  createdAt: Date;
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
    lineUserId: FAKE_LINE_USER_ID,
    deletionRequestedAt: null,
    deletionPurgeAt: null,
    ...overrides,
  };
}

function makeService(opts: {
  findUniqueByLineId?: MockUser | null;
  findUniqueByEmail?: MockUser | null;
  createUser?: MockUser;
  updateUser?: MockUser;
  verifyResponse?: { status: number; body: unknown };
  channelId?: string | null;
}) {
  if (opts.channelId === null) {
    delete process.env.LINE_LOGIN_CHANNEL_ID;
  } else {
    process.env.LINE_LOGIN_CHANNEL_ID = opts.channelId ?? FAKE_CHANNEL_ID;
  }
  process.env.LINE_VERIFY_ENDPOINT = FAKE_VERIFY_URL;

  const verify = opts.verifyResponse ?? {
    status: 200,
    body: {
      iss: 'https://access.line.me',
      sub: FAKE_LINE_USER_ID,
      aud: FAKE_CHANNEL_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      name: 'Tanaka Taro',
      picture: 'https://profile.line-scdn.net/abc',
      email: 'taro@example.com',
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
        .mockImplementation((args: { where: { lineUserId?: string; email?: string } }) => {
          if (args.where.lineUserId !== undefined) {
            return Promise.resolve(opts.findUniqueByLineId ?? null);
          }
          if (args.where.email !== undefined) {
            return Promise.resolve(opts.findUniqueByEmail ?? null);
          }
          return Promise.resolve(null);
        }),
      create: vi.fn().mockResolvedValue(
        opts.createUser ?? makeUser({ id: 'u_new', email: 'taro@example.com' }),
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
    service: new LineAuthService(prisma, auth),
    prisma,
    auth,
    fetchMock,
  };
}

describe('LineAuthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.LINE_LOGIN_CHANNEL_ID = FAKE_CHANNEL_ID;
    process.env.LINE_VERIFY_ENDPOINT = FAKE_VERIFY_URL;
  });

  it('happy path — new LINE user provisioned + AuthResponse returned', async () => {
    const { service, prisma, auth, fetchMock } = makeService({
      findUniqueByLineId: null,
      findUniqueByEmail: null,
    });

    const res = await service.login({ idToken: 'id-token-stub' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FAKE_VERIFY_URL);
    expect(init.method).toBe('POST');
    expect(init.body).toContain('id_token=id-token-stub');
    expect(init.body).toContain(`client_id=${FAKE_CHANNEL_ID}`);

    expect(prisma.user.create).toHaveBeenCalledOnce();
    const createArgs = (prisma.user.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(createArgs.data).toMatchObject({
      authProvider: 'LINE',
      lineUserId: FAKE_LINE_USER_ID,
      lineDisplayName: 'Tanaka Taro',
      linePictureUrl: 'https://profile.line-scdn.net/abc',
      email: 'taro@example.com',
      passwordHash: null,
    });

    expect(auth.issueRefreshToken).toHaveBeenCalled();
    expect(res.accessToken).toBe('access-token-stub');
  });

  it('existing user — refreshes LINE profile snapshot on each login', async () => {
    const existing = makeUser({ id: 'u_existing', email: 'old@stored.local' });
    const { service, prisma } = makeService({
      findUniqueByLineId: existing,
    });

    await service.login({ idToken: 'id-token-stub' });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledOnce();
    const updateArgs = (prisma.user.update as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'u_existing' });
    expect(updateArgs.data).toEqual({
      lineDisplayName: 'Tanaka Taro',
      linePictureUrl: 'https://profile.line-scdn.net/abc',
    });
  });

  it('rejects invalid id_token (verify endpoint returns 400)', async () => {
    const { service } = makeService({
      verifyResponse: {
        status: 400,
        body: {
          error: 'invalid_request',
          error_description: 'IdToken expired.',
        },
      },
    });

    await expect(service.login({ idToken: 'bad' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('surfaces 500 when LINE_LOGIN_CHANNEL_ID is missing', async () => {
    const { service } = makeService({ channelId: null });

    await expect(service.login({ idToken: 'x' })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('blocks audience mismatch even if LINE somehow returned wrong aud', async () => {
    const { service } = makeService({
      verifyResponse: {
        status: 200,
        body: {
          iss: 'https://access.line.me',
          sub: FAKE_LINE_USER_ID,
          aud: 'WRONG_CHANNEL',
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
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
    const { service } = makeService({ findUniqueByLineId: pending });

    await expect(service.login({ idToken: 'x' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_DELETION_PENDING' }),
    });
  });

  it('stores email=null when a different EMAIL-auth account already owns it', async () => {
    const collision = makeUser({
      id: 'u_email_owner',
      email: 'taro@example.com',
      lineUserId: null,
    });
    const { service, prisma } = makeService({
      findUniqueByLineId: null,
      findUniqueByEmail: collision,
    });

    await service.login({ idToken: 'id-token-stub' });

    const createArgs = (prisma.user.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(createArgs.data.email).toBeNull();
    expect(createArgs.data.lineUserId).toBe(FAKE_LINE_USER_ID);
  });
});
