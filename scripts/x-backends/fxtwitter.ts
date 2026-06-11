import { fetchText, extractHtmlMeta } from '../fetch-public.js';
import { cleanText } from '../utils/text.js';
import type { ArticleDiscoveryResult, DiscoveryInput, XArticleBackend } from './types.js';
import { makeDiscoveryResult, normalizeXArticleUrl } from './utils.js';

function fxUrl(url: string): string {
  return url.replace(/^https:\/\/(?:mobile\.)?(?:x|twitter)\.com/i, 'https://api.fxtwitter.com');
}

export class FxTwitterBackend implements XArticleBackend {
  name = 'fxtwitter' as const;

  async discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]> {
    const seeds = new Map<string, ArticleDiscoveryResult>();
    const candidatesFile = await import('../utils/fs.js').then(m => m.readJson<any[]>(`data/candidates/${input.issueDate}.json`, []));
    for (const raw of candidatesFile) {
      const url = normalizeXArticleUrl(raw.canonical_url || raw.article_url || raw.url || '');
      if (url) seeds.set(url, raw as ArticleDiscoveryResult);
    }
    for (const seed of input.curatedX) {
      const url = normalizeXArticleUrl(seed.url || seed.source_url || seed.link || '');
      if (url && !seeds.has(url)) {
        const item = makeDiscoveryResult({ url, sourceUrl: seed.source_url || url, backend: this.name, capturedAt: input.capturedAt, source: seed, title: seed.title, summary: seed.summary, status: 'partial' });
        if (item) seeds.set(url, item);
      }
    }

    const results: ArticleDiscoveryResult[] = [];
    for (const [url, seed] of [...seeds.entries()].slice(0, input.maxCandidates)) {
      const res = await fetchText(fxUrl(url), 5000);
      if (!res.ok) {
        results.push({ ...seed, backend: this.name, fetch_status: 'failed', fetch_error: res.error || `HTTP ${res.status}` });
        continue;
      }
      let title = seed.title || '';
      let summary = seed.summary_seed || '';
      let heat = seed.heat_metrics || {};
      try {
        const data = JSON.parse(res.text);
        const tweet = data.tweet || data.status || data;
        title = cleanText(tweet.text || tweet.title || title).slice(0, 180);
        summary = cleanText(tweet.text || tweet.description || summary).slice(0, 520);
        heat = {
          likes: Number(tweet.likes || tweet.favorite_count || 0) || undefined,
          replies: Number(tweet.replies || tweet.reply_count || 0) || undefined,
          reposts: Number(tweet.retweets || tweet.retweet_count || 0) || undefined,
          views: Number(tweet.views || tweet.view_count || 0) || undefined
        };
      } catch {
        const meta = extractHtmlMeta(res.text, url);
        title = cleanText(meta.title || title).replace(/\s*\/\s*X$/i, '');
        summary = cleanText(meta.description || summary);
      }
      const item = makeDiscoveryResult({
        url,
        sourceUrl: seed.source_url || url,
        backend: this.name,
        capturedAt: input.capturedAt,
        source: seed.source_meta || seed,
        title,
        summary,
        status: title || summary ? 'partial' : 'failed',
        heat,
        sourceMeta: { verified_by: 'fxtwitter_public_metadata' }
      });
      if (item) results.push(item);
    }
    return results;
  }
}
