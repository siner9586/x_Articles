import type { ArticleMetrics, ArticleScore, XArticle } from './types';

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalize(value: unknown, max: number): number {
  const n = safeNumber(value);
  if (!max || max <= 0) return 0;
  return Math.min(1, n / max);
}

export function computeArticleScore(metrics: Partial<ArticleMetrics>, authorQualityScore = 0.5): ArticleScore {
  const bookmark = safeNumber(metrics.bookmark_count);
  const like = safeNumber(metrics.like_count);
  const quote = safeNumber(metrics.quote_count);
  const impression = safeNumber(metrics.impression_count);
  const repost = safeNumber(metrics.repost_count);
  const reply = safeNumber(metrics.reply_count);

  const article_score = Math.round((
    0.45 * normalize(bookmark, 2500) +
    0.25 * normalize(like, 8000) +
    0.15 * normalize(quote, 900) +
    0.10 * normalize(impression, 500000) +
    0.05 * Math.min(1, Math.max(0, authorQualityScore))
  ) * 1000) / 10;

  const learning_value_score = Math.min(10, Math.round((bookmark / 140 + quote / 80 + repost / 120 + 3) * 10) / 10);
  const business_value_score = Math.min(10, Math.round((like / 900 + quote / 120 + 2) * 10) / 10);
  const research_value_score = Math.min(10, Math.round((bookmark / 220 + quote / 70 + reply / 80 + 2) * 10) / 10);
  const novelty_score = Math.min(10, Math.round((quote / 100 + repost / 220 + 4) * 10) / 10);
  const credibility_score = Math.max(4, Math.min(10, Math.round((1 - Math.min(0.6, reply / Math.max(like, 1))) * 10 * 10) / 10));
  const hype_risk_score = Math.min(10, Math.round(((like + repost) / Math.max(bookmark + quote, 1)) * 1.2 * 10) / 10);
  const quality_score = Math.round(((learning_value_score + research_value_score + credibility_score + novelty_score) / 4) * 10) / 10;
  const actionability_score = Math.min(10, Math.round((bookmark / 180 + repost / 240 + 3) * 10) / 10);

  return {
    article_score,
    quality_score,
    novelty_score,
    learning_value_score,
    business_value_score,
    research_value_score,
    actionability_score,
    credibility_score,
    hype_risk_score,
    niche_value_score: Math.round((bookmark / Math.sqrt(impression + 1)) * 1000) / 1000,
    bookmark_growth: 0,
    reason: 'Composite score uses normalized bookmarks, likes, quotes, impressions and a default author quality prior. Niche score uses bookmarks divided by sqrt(impressions + 1) until follower data is available.'
  };
}

export type SortMode = 'bookmarks' | 'likes' | 'score' | 'growth' | 'niche';

export function rankArticles(input: XArticle[], sort: SortMode = 'bookmarks'): XArticle[] {
  return [...input].sort((a, b) => {
    if (sort === 'likes') return b.metrics.like_count - a.metrics.like_count;
    if (sort === 'score') return b.score.article_score - a.score.article_score;
    if (sort === 'growth') return b.score.bookmark_growth - a.score.bookmark_growth;
    if (sort === 'niche') return b.score.niche_value_score - a.score.niche_value_score;
    return b.metrics.bookmark_count - a.metrics.bookmark_count;
  });
}

export function filterArticles(input: XArticle[], params: URLSearchParams | Record<string, string | undefined>): XArticle[] {
  const get = (key: string) => params instanceof URLSearchParams ? params.get(key) || undefined : params[key];
  const topic = get('topic');
  const lang = get('lang');
  const minBookmarks = Number(get('minBookmarks') || 0);
  const minLikes = Number(get('minLikes') || 0);
  return input.filter(article => {
    if (article.status !== 'active') return false;
    if (topic && topic !== 'all' && article.topic_id !== topic) return false;
    if (lang && lang !== 'all' && article.lang !== lang) return false;
    if (article.metrics.bookmark_count < minBookmarks) return false;
    if (article.metrics.like_count < minLikes) return false;
    return true;
  });
}
