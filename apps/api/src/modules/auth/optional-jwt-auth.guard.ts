import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Phase 10.1 — JWT auth guard that DOES NOT reject anonymous requests.
 *
 * Used by endpoints that accept both anonymous and authenticated traffic
 * (telemetry, public review list, …). When a valid bearer token is present,
 * `req.user` is populated as usual; otherwise the request proceeds with
 * `req.user === undefined`.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<T>(_err: unknown, user: T | null): T | null {
    // Swallow auth failure: anonymous is fine here. Return user (may be null).
    return (user ?? null) as T | null;
  }
}
