import { fetchText } from '../fetch-public.js';
import type { ArticleDiscoveryResult, DiscoveryInput, XArticleBackend } from './types.js';
import { extractXArticleUrls, makeDiscoveryResult } from './utils.js';

function nitterBase(): string {
  return (process.env.NITTER_URL || process.env.X_ARTICLES_NITTER_URL || '').replace(/\/$/, '');
}

function nitterSearchUrl(base: string, query: string): string {
  return `${base}/search?f=tweets&q=${encodeURIComponent(query)}`;
}

function nitterUserUrl(base: string, handle: string): string {
  return `${base}/${encodeURIComponent(handle.replace(/^@/, ''))}`;
}

export class NitterPublicBackend implements XArticleBackend {
  name = 'nitter_public' as const;

  async discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]> {
    const base = nitterBase();
    if (!base) {
      return [{
        url: 'nitter_public_disabled',
        canonical_url: 'nitter_public_disabled',
        discovered_at: input.capturedAt,
        fetched_at: input.capturedAt,
        backend: this.name,
        source_url: 'nitter_public',
        fetch_status: 'skipped',
        fetch_error: 'NITTER_URL not configured; optional discovery backend skipped'
      }];
    }

    const results: ArticleDiscoveryResult[] = [];
    const targets: Array<{ url: string; source: any }> = [];
    for (const account of input.xAccounts.slice(0, input.maxAccounts)) {
      const handle = account.handle || '';
      if (!handle || /TODO/i.test(`${handle} ${account.verify_status || ''}`)) continue;
      targets.push({ url: nitterUserUrl(base, handle), source: account });
    }
    for (const row of input.searchQueries.slice(0, input.maxSearchQueries)) {
      const query = row.query || row.q || '';
      if (query) targets.push({ url: nitterSearchUrl(base, query), source: row });
    }

    for (const target of targets.slice(0, 120)) {
      const res = await fetchText(target.url, 8000);
      if (!res.ok) {
        results.push({
          url: target.url,
          canonical_url: target.url,
          discovered_at: input.capturedAt,
          fetched_at: input.capturedAt,
          backend: this.name,
          source_url: target.url,
          source_meta: target.source,
          fetch_status: 'failed',
          fetch_error: res.error || `HTTP ${res.status}`
        });
        continue;
      }
      const urls = extractXArticleUrls(res.text, target.url).slice(0, 30);
      for (const url of urls) {
        const item = makeDiscoveryResult({
          url,
          sourceUrl: target.url,
          backend: this.name,
          capturedAt: input.capturedAt,
          source: target.source,
          html: res.text,
          status: 'partial',
          sourceMeta: { ...target.source, nitter_url: target.url }
        });
        if (item) results.push(item);
      }
    }
    return results;
  }
}
