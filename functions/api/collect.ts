import { fail, isAuthorized, ok, safeError } from '../../src/lib/api';
import { getProvider } from '../../src/lib/providers';
import { enabledTopics } from '../../src/lib/topics';

type Env = Record<string, string | undefined> & { DB?: D1Database };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isAuthorized(request, env)) return fail('UNAUTHORIZED', 'ADMIN_TOKEN is required for collect.', 401);
  try {
    const provider = getProvider(env);
    const topics = enabledTopics();
    const results = [];
    for (const topic of topics.slice(0, 12)) {
      const items = await provider.searchArticles({ topic_id: topic.id, keywords: topic.keywords, min_bookmarks: topic.min_bookmarks, min_likes: topic.min_likes, limit: 20 });
      results.push(...items);
    }
    return ok({ provider: provider.name, collected: results.length, persisted: Boolean(env.DB), note: env.DB ? 'D1 persistence can be added by extending this handler.' : 'No D1 binding detected; returning provider results only.' });
  } catch (error) {
    return fail('COLLECT_FAILED', safeError(error), 500);
  }
};
