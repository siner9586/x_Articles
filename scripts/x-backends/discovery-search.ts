import { fetchText } from '../fetch-public.js';
import type { ArticleDiscoveryResult, DiscoveryInput, XArticleBackend } from './types.js';
import { extractXArticleUrls, makeDiscoveryResult } from './utils.js';

function ddgUrl(query: string): string {
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function xSearchUrl(query: string): string {
  return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      out.push(...await fn(current));
    }
  });
  await Promise.all(workers);
  return out;
}

export class DiscoverySearchBackend implements XArticleBackend {
  name = 'discovery_search' as const;

  async discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]> {
    const queries = input.searchQueries.slice(0, input.maxSearchQueries);
    const targets: Array<{ sourceUrl: string; row: any }> = [];
    for (const row of queries) {
      const query = row.query || row.q || '';
      if (!query) continue;
      for (const sourceUrl of [xSearchUrl(query), ddgUrl(query)]) {
        targets.push({ sourceUrl, row });
      }
    }

    const concurrency = Number(process.env.X_ARTICLES_SEARCH_CONCURRENCY || 8);
    return mapLimit(targets, concurrency, async ({ sourceUrl, row }) => {
      const results: ArticleDiscoveryResult[] = [];
      const res = await fetchText(sourceUrl, Number(process.env.X_ARTICLES_SEARCH_TIMEOUT_MS || 3500));
        if (!res.ok) {
          results.push({
            url: sourceUrl,
            canonical_url: sourceUrl,
            discovered_at: input.capturedAt,
            fetched_at: input.capturedAt,
            backend: this.name,
            source_url: sourceUrl,
            source_meta: row,
            fetch_status: 'failed',
            fetch_error: res.error || `HTTP ${res.status}`
          });
          return results;
        }
        const urls = extractXArticleUrls(res.text, sourceUrl).slice(0, 40);
        for (const url of urls) {
          const item = makeDiscoveryResult({
            url,
            sourceUrl,
            backend: this.name,
            capturedAt: input.capturedAt,
            source: {
              display_name: row.source || 'Search discovery',
              priority: row.priority || 78,
              tags: row.tags || [],
              language: row.language || 'en'
            },
            html: res.text,
            status: 'partial',
            sourceMeta: row
          });
          if (item) results.push(item);
        }
      return results;
    });
  }
}
