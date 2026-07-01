import { fail, isAuthorized, ok, safeError } from '../../src/lib/api';
import { articles } from '../../src/lib/mock-data';
import { getProvider } from '../../src/lib/providers';

type Env = Record<string, string | undefined>;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isAuthorized(request, env)) return fail('UNAUTHORIZED', 'ADMIN_TOKEN is required for metric refresh.', 401);
  try {
    const provider = getProvider(env);
    const ids = articles.slice(0, Number(env.MAX_ARTICLES_PER_RUN || 100)).map(item => item.id);
    const refreshed = await provider.refreshMetrics(ids);
    return ok({ provider: provider.name, refreshed: refreshed.length, snapshot_policy: '0-6h hourly, 6-24h every 3h, 1-7d daily, then weekly or stop' });
  } catch (error) {
    return fail('REFRESH_METRICS_FAILED', safeError(error), 500);
  }
};
