import type { ApiFailure, ApiSuccess } from './types';

export function json<T>(data: ApiSuccess<T> | ApiFailure, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {})
    }
  });
}

export function ok<T>(data: T, init: ResponseInit = {}) {
  return json<T>({ ok: true, data, error: null }, init);
}

export function fail(code: string, message: string, status = 400) {
  return json<never>({ ok: false, data: null, error: { code, message } }, { status });
}

export function isAuthorized(request: Request, env: Record<string, string | undefined>): boolean {
  const token = env.ADMIN_TOKEN;
  if (!token) return false;
  const url = new URL(request.url);
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-admin-token');
  const query = url.searchParams.get('admin_token');
  return [bearer, header, query].includes(token);
}

export function safeError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace(/[A-Za-z0-9_\-]{24,}/g, '[redacted]').slice(0, 220);
}
