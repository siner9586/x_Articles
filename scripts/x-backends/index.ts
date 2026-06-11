import { readJson } from '../utils/fs.js';
import { FetchBackendName, BackendStat, DiscoveryInput, XArticleBackend, ArticleDiscoveryResult } from './types.js';
import { StaticHttpBackend } from './static-http.js';
import { BrowserRenderBackend } from './browser-render.js';
import { DiscoverySearchBackend } from './discovery-search.js';
import { CuratedLiveBackend } from './curated-live.js';
import { FxTwitterBackend } from './fxtwitter.js';

function emptyStat(): BackendStat {
  return { attempted: 0, ok: 0, partial: 0, failed: 0, skipped: 0, article_urls_found: 0 };
}

function enabledBackendNames(): FetchBackendName[] {
  const raw = process.env.X_ARTICLES_FETCH_BACKENDS || 'static_http,browser_render,discovery_search,curated_live,fxtwitter';
  return raw.split(',').map(s => s.trim()).filter(Boolean) as FetchBackendName[];
}

function backendFactory(name: FetchBackendName): XArticleBackend | undefined {
  if (name === 'static_http') return new StaticHttpBackend();
  if (name === 'browser_render') return new BrowserRenderBackend();
  if (name === 'discovery_search') return new DiscoverySearchBackend();
  if (name === 'curated_live') return new CuratedLiveBackend();
  if (name === 'fxtwitter') return new FxTwitterBackend();
  return undefined;
}

export function parseBackendConfig() {
  return {
    backends: enabledBackendNames(),
    maxAccounts: Number(process.env.X_ARTICLES_MAX_ACCOUNTS || 80),
    maxSearchQueries: Number(process.env.X_ARTICLES_MAX_SEARCH_QUERIES || 30),
    maxCandidates: Number(process.env.X_ARTICLES_MAX_CANDIDATES || 200),
    browserHeadless: process.env.X_ARTICLES_BROWSER_HEADLESS !== 'false'
  };
}

export async function runBackends(input: DiscoveryInput): Promise<{
  results: ArticleDiscoveryResult[];
  backends_enabled: FetchBackendName[];
  backend_stats: Record<string, BackendStat>;
  errors: Array<Record<string, any>>;
}> {
  const names = enabledBackendNames();
  const results: ArticleDiscoveryResult[] = [];
  const errors: Array<Record<string, any>> = [];
  const backend_stats: Record<string, BackendStat> = {};

  for (const name of names) {
    const backend = backendFactory(name);
    backend_stats[name] = emptyStat();
    if (!backend) {
      backend_stats[name].skipped += 1;
      errors.push({ backend: name, phase: 'backend_factory', error: 'unknown_backend' });
      continue;
    }
    try {
      const out = await backend.discover(input);
      backend_stats[name].attempted += 1;
      backend_stats[name].article_urls_found += out.filter(item => /^https:\/\/x\.com\//.test(item.canonical_url || '')).length;
      for (const item of out) {
        if (item.fetch_status === 'failed') backend_stats[name].failed += 1;
        else if (item.fetch_status === 'partial') backend_stats[name].partial += 1;
        else if (item.fetch_status === 'skipped') backend_stats[name].skipped += 1;
        else backend_stats[name].ok += 1;
        if (item.fetch_status === 'failed') errors.push({ backend: name, phase: 'discover', source: item.source_url, error: item.fetch_error || 'failed' });
      }
      results.push(...out);
    } catch (error: any) {
      backend_stats[name].attempted += 1;
      backend_stats[name].failed += 1;
      errors.push({ backend: name, phase: 'discover', error: String(error?.message || error).slice(0, 240) });
    }
  }
  const existing = await readJson<ArticleDiscoveryResult[]>(`data/raw/backend-extra-results-${input.issueDate}.json`, []);
  if (Array.isArray(existing) && existing.length) results.push(...existing);
  return { results, backends_enabled: names, backend_stats, errors };
}
