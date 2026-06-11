import { fetchText } from '../fetch-public.js';
import type { DiscoveryInput, XArticleBackend, ArticleDiscoveryResult } from './types.js';
import { extractXArticleUrls, makeDiscoveryResult, xSeedUrls } from './utils.js';

export class StaticHttpBackend implements XArticleBackend {
  name = 'static_http' as const;

  async discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]> {
    const results: ArticleDiscoveryResult[] = [];
    const accounts = input.xAccounts.slice(0, input.maxAccounts);
    for (const account of accounts) {
      if (!account?.x_url || /TODO|needs_manual_confirmation/i.test(`${account.handle || ''} ${account.verify_status || ''}`)) continue;
      for (const seedUrl of xSeedUrls(account)) {
        const res = await fetchText(seedUrl, 7000);
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
          continue;
        }
        const urls = extractXArticleUrls(res.text, seedUrl).slice(0, 20);
        for (const url of urls) {
          const item = makeDiscoveryResult({ url, sourceUrl: seedUrl, backend: this.name, capturedAt: input.capturedAt, source: account, html: res.text, status: 'partial' });
          if (item) results.push(item);
        }
      }
    }
    return results;
  }
}
