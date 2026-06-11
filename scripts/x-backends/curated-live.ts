import { fetchText } from '../fetch-public.js';
import type { ArticleDiscoveryResult, DiscoveryInput, XArticleBackend } from './types.js';
import { makeDiscoveryResult, normalizeXArticleUrl } from './utils.js';

export class CuratedLiveBackend implements XArticleBackend {
  name = 'curated_live' as const;

  async discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]> {
    const results: ArticleDiscoveryResult[] = [];
    for (const seed of input.curatedX) {
      const url = normalizeXArticleUrl(seed.url || seed.source_url || seed.link || '');
      if (!url) continue;
      const res = await fetchText(url, 5000);
      const item = makeDiscoveryResult({
        url,
        sourceUrl: seed.source_url || url,
        backend: this.name,
        capturedAt: input.capturedAt,
        source: {
          ...seed,
          handle: seed.author_handle || String(seed.author || '').replace(/^@/, ''),
          display_name: seed.author || seed.source || 'Curated X Article',
          priority: seed.priority || 82,
          tags: seed.tags || []
        },
        title: seed.title,
        summary: seed.summary || seed.description || seed.excerpt,
        html: res.ok ? res.text : '',
        status: res.ok ? 'partial' : 'failed',
        error: res.ok ? undefined : (res.error || `HTTP ${res.status}`),
        sourceMeta: seed
      });
      if (item) results.push(item);
    }
    return results;
  }
}
