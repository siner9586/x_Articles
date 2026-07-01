import { fail, isAuthorized, ok } from '../../src/lib/api';
import { articles } from '../../src/lib/mock-data';

export const onRequestPost: PagesFunction<Record<string, string | undefined>> = async ({ request, env }) => {
  if (!isAuthorized(request, env)) return fail('UNAUTHORIZED', 'ADMIN_TOKEN is required for AI summarization.', 401);
  const max = Math.min(Number(env.MAX_AI_SUMMARIES_PER_RUN || 20), 50);
  return ok({ summarized: Math.min(max, articles.length), provider: env.AI_PROVIDER || 'mock', model: env.AI_MODEL || 'gpt-4.1-mini', note: 'MVP uses stored mock summaries; wire OPENAI_API_KEY for real generation.' });
};
