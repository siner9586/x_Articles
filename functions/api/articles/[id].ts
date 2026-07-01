import { ok, fail } from '../../../src/lib/api';
import { findArticle } from '../../../src/lib/mock-data';

export const onRequestGet: PagesFunction = async ({ params }) => {
  const id = String(params.id || '');
  const article = findArticle(id);
  if (!article) return fail('ARTICLE_NOT_FOUND', 'Article not found or unavailable.', 404);
  return ok({ article, mock: true });
};
