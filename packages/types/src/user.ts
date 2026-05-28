import { z } from 'zod';

export const userRoleSchema = z.enum(['CUSTOMER', 'MERCHANT', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  /// Nullable since Phase 21 — LINE Login users may not grant email scope.
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  name: z.string().nullable(),
  role: userRoleSchema,
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(64),
  name: z.string().min(1).max(64).optional(),
  role: userRoleSchema.optional().default('CUSTOMER'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/// Phase 21 — LINE Login (LIFF). Client passes an id_token obtained via
/// `liff.getIDToken()`; server verifies against LINE's verify endpoint
/// then issues our standard AuthResponse.
export const lineLoginSchema = z.object({
  idToken: z.string().min(20).max(4096),
  nonce: z.string().min(8).max(128).optional(),
});
export type LineLoginInput = z.infer<typeof lineLoginSchema>;

/// Phase 21.2 — Google Sign-In. Client passes an id_token obtained via
/// Google Identity Services (`google.accounts.id`); server verifies it
/// against Google's tokeninfo endpoint then issues our standard AuthResponse.
export const googleLoginSchema = z.object({
  idToken: z.string().min(20).max(4096),
  nonce: z.string().min(8).max(128).optional(),
});
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  /**
   * Phase 13.3b — single-use refresh token. Optional in the schema so legacy
   * clients (Phase 9 PWA installs) don't break, but the server always emits
   * one for new sessions. Pair with `POST /v1/auth/refresh` to get a new
   * access token (and a rotated refresh token) when the access expires.
   */
  refreshToken: z.string().optional(),
  /** Seconds until `accessToken` expires (advisory; clients should also decode the JWT exp). */
  expiresInSec: z.number().int().positive().optional(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
