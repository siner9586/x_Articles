import { ok, fail } from '../../src/lib/api';

type Env = { DB?: D1Database; AI_PROVIDER?: string; X_PROVIDER?: string };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let database = 'not_bound';
  try {
    if (env.DB) {
      await env.DB.prepare('SELECT 1 AS ok').first();
      database = 'ok';
    }
  } catch {
    database = 'error';
  }
  if (database === 'error') return fail('DB_UNAVAILABLE', 'Database binding exists but health query failed.', 503);
  return ok({
    service: 'x-articles-intelligence',
    version: '1.0.0',
    status: 'ok',
    database,
    provider: env.X_PROVIDER || 'mock',
    ai_provider: env.AI_PROVIDER || 'mock',
    compliance: 'official_x_api_or_mcp_only_no_browser_scraping',
    generated_at: new Date().toISOString()
  });
};
