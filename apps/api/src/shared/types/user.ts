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

/// Phase 21 — LINE Login. The frontend obtains `idToken` via LIFF
/// (liff.getIDToken()) and POSTs it to the backend; the backend verifies
/// the token against LINE's verify endpoint, then issues our standard
/// AuthResponse. Min length is a sanity guard — real id_tokens are 600+ chars.
export const lineLoginSchema = z.object({
  idToken: z.string().min(20).max(4096),
  /// Optional nonce we generated client-side and embedded in the LIFF
  /// login() call. When provided, the server enforces nonce match against
  /// the id_token claim to harden replay attacks.
  nonce: z.string().min(8).max(128).optional(),
});
export type LineLoginInput = z.infer<typeof lineLoginSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresInSec: z.number().int().positive().optional(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
