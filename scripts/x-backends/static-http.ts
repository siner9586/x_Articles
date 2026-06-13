import { fetchText } from '../fetch-public.js';
import type { DiscoveryInput, XArticleBackend, ArticleDiscoveryResult } from './types.js';
import { extractXArticleUrls, makeDiscoveryResult, xSeedUrls } from './utils.js';

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

export class StaticHttpBackend implements XArticleBackend {
  name = 'static_http' as const;

  async discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]> {
    const accounts = input.xAccounts.slice(0, input.maxAccounts);
    const targets: Array<{ seedUrl: string; account: any }> = [];
    const urlsPerAccount = Number(process.env.X_ARTICLES_URLS_PER_ACCOUNT || 3);
    for (const account of accounts) {
      if (!account?.x_url || /TODO/i.test(`${account.handle || ''} ${account.verify_status || ''}`)) continue;
      for (const seedUrl of xSeedUrls(account).slice(0, urlsPerAccount)) {
        targets.push({ seedUrl, account });
      }
    }

    const concurrency = Number(process.env.X_ARTICLES_STATIC_HTTP_CONCURRENCY || 16);
    return mapLimit(targets, concurrency, async ({ seedUrl, account }) => {
      const results: ArticleDiscoveryResult[] = [];
      const res = await fetchText(seedUrl, Number(process.env.X_ARTICLES_STATIC_HTTP_TIMEOUT_MS || 3200));
        if (!res.ok) {
          results.push({
            url: seedUrl,
            canonical_url: seedUrl,
            discovered_at: input.capturedAt,
            fetched_at: input.capturedAt,
            backend: this.name,
            source_url: seedUrl,
            source_meta: account,
            fetch_status: 'failed',
            fetch_error: res.error || `HTTP ${res.status}`
          });
          return results;
        }
        const urls = extractXArticleUrls(res.text, seedUrl).slice(0, 20);
        for (const url of urls) {
          const item = makeDiscoveryResult({ url, sourceUrl: seedUrl, backend: this.name, capturedAt: input.capturedAt, source: account, html: res.text, status: 'partial' });
          if (item) results.push(item);
        }
      return results;
    });
  }
}
