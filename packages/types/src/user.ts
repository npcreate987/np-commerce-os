import { z } from 'zod';

export const userRoleSchema = z.enum(['CUSTOMER', 'MERCHANT', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
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
