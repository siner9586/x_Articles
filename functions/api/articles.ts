import { ok, fail, safeError } from '../../src/lib/api';
import { articles } from '../../src/lib/mock-data';
import { filterArticles, rankArticles, type SortMode } from '../../src/lib/scoring';

export const onRequestGet: PagesFunction = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const sort = (url.searchParams.get('sort') || 'bookmarks') as SortMode;
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
    const filtered = filterArticles(articles, url.searchParams);
    return ok({ articles: rankArticles(filtered, sort).slice(0, limit), count: filtered.length, sort, mock: true });
  } catch (error) {
    return fail('ARTICLES_QUERY_FAILED', safeError(error), 500);
  }
};
