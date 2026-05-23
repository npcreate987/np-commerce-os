import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { captureException, isSentryEnabled } from '../observability/sentry';

/**
 * Global exception filter.
 *
 *  • Known `HttpException` (400/401/403/404/422/etc.) → forward the Nest body
 *    untouched. These are *expected* errors so we **do not** report them to
 *    Sentry — they would drown out real bugs.
 *  • 5xx HttpExceptions (rare; usually thrown by integration adapters) ARE
 *    reported, because they typically indicate an upstream failure worth
 *    investigating.
 *  • Anything else (TypeError, ReferenceError, raw `Error`) is a bug. We:
 *      1. Log via Nest `Logger` so it shows up in stdout / Fastify access log.
 *      2. `captureException` to Sentry with the request URL + reqId tag.
 *      3. Reply with a generic 500 so we never leak stack traces to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500 && isSentryEnabled()) {
        captureException(exception, {
          url: request.url,
          method: request.method,
          requestId: request.id,
        });
      }
      const body = exception.getResponse();
      void reply.status(status).send(body);
      return;
    }

    // Unexpected exception — bug surface.
    this.logger.error(exception);
    captureException(exception, {
      url: request.url,
      method: request.method,
      requestId: request.id,
    });
    void reply
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send({ statusCode: 500, message: 'Internal server error' });
  }
}
