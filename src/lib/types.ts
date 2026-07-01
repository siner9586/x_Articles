export type TopicConfig = {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  languages: string[];
  min_bookmarks: number;
  min_likes: number;
  enabled: boolean;
};

export type ArticleMetrics = {
  bookmark_count: number;
  like_count: number;
  quote_count: number;
  repost_count: number;
  reply_count: number;
  impression_count: number;
};

export type ArticleScore = {
  article_score: number;
  quality_score: number;
  novelty_score: number;
  learning_value_score: number;
  business_value_score: number;
  research_value_score: number;
  actionability_score: number;
  credibility_score: number;
  hype_risk_score: number;
  niche_value_score: number;
  bookmark_growth: number;
  reason: string;
};

export type ArticleSummary = {
  one_sentence: string;
  summary_zh: string;
  key_points: string[];
  action_items: string[];
  learning_notes: string;
  topic_tags: string[];
  knowledge_domains: string[];
  recommended_use: string[];
  limitations: string;
  why_it_matters: string;
  confidence: 'low' | 'medium' | 'high';
};

export type XArticle = {
  id: string;
  article_id: string;
  author_id: string;
  author_username: string;
  author_name: string;
  title: string;
  text_preview: string;
  lang: string;
  created_at: string;
  url: string;
  topic_id: string;
  source_query: string;
  possibly_sensitive: boolean;
  status: 'active' | 'unavailable' | 'deleted';
  collected_at: string;
  updated_at: string;
  metrics: ArticleMetrics;
  score: ArticleScore;
  summary: ArticleSummary;
  tags: Array<{ tag: string; tag_type: string }>;
};

export type ArticleSearchParams = {
  topic_id?: string;
  keywords?: string[];
  time_window?: '24h' | '7d' | '30d' | 'all';
  language?: string;
  min_bookmarks?: number;
  min_likes?: number;
  limit?: number;
};

export type XArticleProvider = {
  name: string;
  searchArticles(params: ArticleSearchParams): Promise<XArticle[]>;
  refreshMetrics(postIds: string[]): Promise<Array<{ post_id: string; metrics: ArticleMetrics; status?: XArticle['status'] }>>;
};

export type ApiSuccess<T> = { ok: true; data: T; error: null };
export type ApiFailure = { ok: false; data: null; error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
