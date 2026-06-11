export type FetchBackendName = 'static_http' | 'browser_render' | 'discovery_search' | 'curated_live' | 'fxtwitter';

export type DiscoveryInput = {
  issueDate: string;
  capturedAt: string;
  fetchBatchId: string;
  xAccounts: any[];
  curatedX: any[];
  searchQueries: any[];
  maxAccounts: number;
  maxSearchQueries: number;
  maxCandidates: number;
  browserHeadless: boolean;
};

export type ArticleDiscoveryResult = {
  url: string;
  canonical_url: string;
  title?: string;
  author?: string;
  author_handle?: string;
  published_at?: string;
  discovered_at: string;
  fetched_at: string;
  backend: FetchBackendName;
  source_url: string;
  source_meta?: Record<string, any>;
  heat_metrics?: Record<string, number | boolean | undefined>;
  raw_text_available?: boolean;
  summary_seed?: string;
  fetch_status: 'ok' | 'partial' | 'failed' | 'skipped';
  fetch_error?: string;
};

export type BackendStat = {
  attempted: number;
  ok: number;
  partial: number;
  failed: number;
  skipped: number;
  article_urls_found: number;
};

export interface XArticleBackend {
  name: FetchBackendName;
  discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]>;
}
