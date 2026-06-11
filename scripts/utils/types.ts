export type ContentType = 'x_article' | 'external_article' | 'company_blog_article' | 'media_article' | 'vc_article' | 'research_blog_article';

export type SourcePlatform = 'x' | 'rss' | 'json_feed' | 'sitemap' | 'html_index' | 'manual' | 'hn' | 'external';
export type DiscoveryMethod =
  | 'rss'
  | 'atom'
  | 'json_feed'
  | 'sitemap'
  | 'html_index'
  | 'manual'
  | 'curated_x'
  | 'curated_live'
  | 'curated_external'
  | 'x_profile'
  | 'x_articles_tab'
  | 'x_search'
  | 'static_http'
  | 'browser_render'
  | 'discovery_search'
  | 'fxtwitter';

export type Candidate = {
  id: string;
  canonical_url: string;
  article_url?: string;
  normalized_url?: string;
  article_id?: string;
  url_hash?: string;
  content_hash?: string;
  near_title_hash?: string;
  near_content_hash?: string;
  author_title_hash?: string;
  source_url: string;
  source_platform: SourcePlatform;
  source_type: string;
  source_domain: string;
  content_type: ContentType;
  title: string;
  subtitle?: string;
  author?: string;
  author_url?: string;
  author_handle?: string;
  author_role?: string;
  organization?: string;
  language?: string;
  published_at?: string;
  captured_at: string;
  discovered_at?: string;
  fetched_at?: string;
  fetch_batch_id?: string;
  run_id?: string;
  discovery_run_date?: string;
  discovery_method?: DiscoveryMethod;
  backend?: string;
  backend_chain?: string[];
  live_fetch?: boolean;
  first_seen_key?: string;
  lastmod?: string;
  summary?: string;
  excerpt?: string;
  raw_text_available: boolean;
  topics: string[];
  tags: string[];
  entities: string[];
  mentioned_companies: string[];
  mentioned_people: string[];
  mentioned_products: string[];
  mentioned_papers: string[];
  mentioned_repos: string[];
  evidence_links: string[];
  heat_metrics?: Record<string, number | boolean | undefined>;
  engagement: Record<string, number | undefined>;
  source_score: number;
  information_density_score: number;
  originality_score: number;
  trend_score: number;
  evidence_score: number;
  heat_score: number;
  article_confidence_score?: number;
  freshness_score?: number;
  quality_score?: number;
  site_fit_score: number;
  total_score: number;
  score?: number;
  rank?: number;
  cluster_id?: string;
  dedupe_key: string;
  title_hash: string;
  status: 'candidate' | 'selected' | 'archived' | 'rejected';
  reason_selected?: string;
  reason_for_selection?: string;
  summary_zh?: string;
  summary_en?: string;
  reason_rejected?: string;
  fetch_status: 'ok' | 'partial' | 'failed' | 'skipped';
  fetch_error?: string;
  first_seen_issue?: string;
  last_seen_issue?: string;
  used_in_issue?: string;
  core_takeaway?: string;
  why_it_matters?: string;
  possible_impact?: string;
  what_to_watch_next?: string;
};

export type Cluster = {
  cluster_id: string;
  title: string;
  summary: string;
  primary_source: string;
  supporting_sources: string[];
  related_x_posts: string[];
  related_articles: string[];
  entities: string[];
  tags: string[];
  score: number;
  selected_item_id: string;
};
