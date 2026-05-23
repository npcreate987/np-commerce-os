import { createHash, createHmac } from 'crypto';

/**
 * Minimal AWS SigV4 query-string presigner for S3-compatible PUT uploads.
 *
 * Works with: AWS S3, Cloudflare R2 (us-auto-1 region as 'auto'), MinIO,
 * Backblaze B2 (s3-compatible), Wasabi.
 *
 * Why not @aws-sdk? — keeps boot lean + zero deps. We only need PUT
 * presign here. Implementation follows the spec at:
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */

export interface SigV4PresignOptions {
  method: 'PUT';
  endpoint: string; // e.g. https://s3.us-east-1.amazonaws.com  or  https://<acct>.r2.cloudflarestorage.com
  region: string;
  bucket: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Seconds the URL stays valid (max 7 days = 604800). */
  expiresInSec: number;
  /** Content-Type that the upload MUST send (signed). */
  contentType: string;
  /** If set, signs x-amz-content-sha256=UNSIGNED-PAYLOAD; matches S3 default. */
  unsignedPayload?: boolean;
  /** Force "path-style" (https://host/bucket/key) — true for MinIO/R2. */
  pathStyle?: boolean;
}

function hex(buf: Buffer): string {
  return buf.toString('hex');
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function uriEncode(s: string, encodeSlash: boolean): string {
  // AWS canonical URI encoding: RFC 3986 but UNRESERVED chars stay
  // (A-Z a-z 0-9 - _ . ~) and '/' optionally encoded.
  const buf = Buffer.from(s, 'utf8');
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i] as number;
    if (
      (c >= 0x41 && c <= 0x5a) || // A-Z
      (c >= 0x61 && c <= 0x7a) || // a-z
      (c >= 0x30 && c <= 0x39) || // 0-9
      c === 0x2d || // -
      c === 0x5f || // _
      c === 0x2e || // .
      c === 0x7e || // ~
      (c === 0x2f && !encodeSlash) // /
    ) {
      out += String.fromCharCode(c);
    } else {
      out += '%' + c.toString(16).padStart(2, '0').toUpperCase();
    }
  }
  return out;
}

/**
 * Returns a presigned URL string that can be PUT'd directly from the browser.
 * The returned URL already contains all auth as query params; the request
 * only needs to send the Content-Type header (must match what was signed).
 */
export function presignPutUrl(opts: SigV4PresignOptions): {
  url: string;
  headers: Record<string, string>;
} {
  const now = new Date();
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '')
      .slice(0, 15) + 'Z'; // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const url = new URL(opts.endpoint);
  const host = url.host;
  const pathPrefix = opts.pathStyle
    ? `/${opts.bucket}`
    : ''; // virtual-hosted: bucket is part of host (caller's responsibility)
  const canonicalUri = `${pathPrefix}/${uriEncode(opts.objectKey, false)}`;

  const credentialScope = `${dateStamp}/${opts.region}/s3/aws4_request`;
  const signedHeaders = 'content-type;host';
  const payloadHash = opts.unsignedPayload ?? true ? 'UNSIGNED-PAYLOAD' : '';

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${opts.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.min(opts.expiresInSec, 604800)),
    'X-Amz-SignedHeaders': signedHeaders,
    'X-Amz-Content-Sha256': payloadHash,
  };

  const canonicalQuery = Object.keys(params)
    .sort()
    .map(
      (k) =>
        `${uriEncode(k, true)}=${uriEncode(params[k] as string, true)}`,
    )
    .join('&');

  const canonicalHeaders = `content-type:${opts.contentType}\nhost:${host}\n`;

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');

  // Derive signing key
  const kDate = hmac(`AWS4${opts.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, opts.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hex(hmac(kSigning, stringToSign));

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  const fullUrl = `${url.protocol}//${host}${canonicalUri}?${finalQuery}`;

  return {
    url: fullUrl,
    headers: { 'Content-Type': opts.contentType },
  };
}

// =============================================================================
// SigV4 DELETE — for Phase 12.2 bucket cleanup when a video row is removed.
//
// DELETE doesn't carry a body, so the canonical request omits content-type
// from the signed headers and uses the empty-payload hash. Otherwise the
// algorithm is identical to PUT presigning above.
// =============================================================================

export interface SigV4DeleteOptions {
  endpoint: string;
  region: string;
  bucket: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle?: boolean;
}

/**
 * Synchronously execute an S3 DELETE for an object using SigV4 query-string
 * auth, then return the HTTP status. Throws on network failure but tolerates
 * HTTP 404 (S3 DELETE is idempotent — missing objects "succeed").
 */
export async function deleteObject(opts: SigV4DeleteOptions): Promise<number> {
  const now = new Date();
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '')
      .slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const url = new URL(opts.endpoint);
  const host = url.host;
  const pathPrefix = opts.pathStyle ? `/${opts.bucket}` : '';
  const canonicalUri = `${pathPrefix}/${uriEncode(opts.objectKey, false)}`;

  const credentialScope = `${dateStamp}/${opts.region}/s3/aws4_request`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${opts.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': '60',
    'X-Amz-SignedHeaders': signedHeaders,
    'X-Amz-Content-Sha256': payloadHash,
  };

  const canonicalQuery = Object.keys(params)
    .sort()
    .map(
      (k) =>
        `${uriEncode(k, true)}=${uriEncode(params[k] as string, true)}`,
    )
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    'DELETE',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${opts.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, opts.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hex(hmac(kSigning, stringToSign));

  const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  const fullUrl = `${url.protocol}//${host}${canonicalUri}?${finalQuery}`;

  const res = await fetch(fullUrl, { method: 'DELETE' });
  // S3 returns 204 on success, 404 if the object was already absent. Both are
  // safe outcomes for our "best-effort cleanup" use case.
  if (res.status === 204 || res.status === 404 || res.status === 200) {
    return res.status;
  }
  // Don't include the response body — could leak signed URL in error logs.
  throw new Error(`S3 DELETE failed: ${res.status} ${res.statusText}`);
}
