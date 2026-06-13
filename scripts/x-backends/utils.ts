import { extractHrefLinks, extractLinks } from '../extract-links.js';
import { canonicalizeUrl, extractXArticleId, isXArticleUrl } from '../x-article.js';
import { extractHtmlMeta } from '../fetch-public.js';
import { cleanText, unique } from '../utils/text.js';
import type { ArticleDiscoveryResult, FetchBackendName } from './types.js';

export function normalizeXArticleUrl(url = ''): string {
  const canonical = canonicalizeUrl(String(url || '').replace(/\\\//g, '/').replace(/&amp;/g, '&'));
  return isXArticleUrl(canonical) ? canonical : '';
}

export function extractXArticleUrls(text = '', baseUrl = ''): string[] {
  const hrefs = extractHrefLinks(text, baseUrl);
  const rawUrls = extractLinks(text);
  const escaped = [...text.matchAll(/https?:\\?\/\\?\/(?:x|twitter)\.com\\?\/[^\s"'<>]+/gi)]
    .map(m => m[0].replace(/\\\//g, '/'));
  const pathOnly = [...text.matchAll(/(?:href|url|expanded_url|canonical_url)["'\s:=]+(["']?)(\/(?:i\/)?articles?\/[^"'\s<>]+|\/[A-Za-z0-9_]{1,30}\/articles?\/[^"'\s<>]+)\1/gi)]
    .map(m => new URL(m[2], baseUrl || 'https://x.com').toString());
  return unique([...hrefs, ...rawUrls, ...escaped, ...pathOnly].map(normalizeXArticleUrl).filter(Boolean));
}

export function sourceFromAccount(account: any = {}) {
  const handle = cleanText(account.handle || '').replace(/^@/, '');
  return {
    handle,
    display_name: cleanText(account.display_name || account.name || handle || 'X Article author'),
    name: cleanText(account.name || account.display_name || handle || 'X Article author'),
    organization: cleanText(account.organization || ''),
    role: cleanText(account.role || ''),
    x_url: account.x_url || (handle ? `https://x.com/${handle}` : ''),
    priority: Number(account.priority || 76),
    tags: Array.isArray(account.tags) ? account.tags : [],
    language: account.language || 'en'
  };
}

export function makeDiscoveryResult(args: {
  url: string;
  sourceUrl: string;
  backend: FetchBackendName;
  capturedAt: string;
  source?: any;
  title?: string;
  summary?: string;
  html?: string;
  status?: 'ok' | 'partial' | 'failed' | 'skipped';
  error?: string;
  heat?: Record<string, number | boolean | undefined>;
  sourceMeta?: Record<string, any>;
}): ArticleDiscoveryResult | undefined {
  const canonical = normalizeXArticleUrl(args.url);
  if (!canonical) return;
  const meta = args.html ? extractHtmlMeta(args.html, canonical) : { title: '', description: '', canonical_url: canonical };
  const source = sourceFromAccount(args.source || {});
  const title = cleanText(args.title || meta.title || '').replace(/\s*\/\s*X$/i, '');
  const summary = cleanText(args.summary || meta.description || '');
  return {
    url: canonical,
    canonical_url: canonical,
    article_id: extractXArticleId(canonical),
    title,
    author: cleanText(args.source?.author || args.source?.display_name || source.display_name),
    author_handle: cleanText(args.source?.author_handle || source.handle),
    published_at: cleanText(args.source?.published_at || args.source?.date || ''),
    discovered_at: args.capturedAt,
    fetched_at: args.capturedAt,
    backend: args.backend,
    source_url: args.sourceUrl || canonical,
    source_meta: args.sourceMeta || source,
    heat_metrics: args.heat || args.source?.heat_metrics || {},
    raw_text_available: false,
    summary_seed: summary,
    fetch_status: args.status || (title || summary ? 'partial' : 'failed'),
    fetch_error: args.error
  };
}

export function xSeedUrls(account: any): string[] {
  const handle = cleanText(account.handle || '').replace(/^@/, '');
  const xUrl = account.x_url || (handle ? `https://x.com/${handle}` : '');
  const urls: string[] = [];
  if (handle) urls.push(`https://x.com/${handle}/articles`);
  if (xUrl) urls.push(xUrl);
  if (handle) {
    urls.push(`https://x.com/search?q=from%3A${encodeURIComponent(handle)}%20%22x.com%2Fi%2Farticle%22&src=typed_query&f=live`);
    urls.push(`https://x.com/search?q=from%3A${encodeURIComponent(handle)}%20filter%3Alinks%20article&src=typed_query&f=live`);
    urls.push(`https://x.com/search?q=from%3A${encodeURIComponent(handle)}%20%22%2Farticle%2F%22&src=typed_query&f=live`);
    urls.push(`https://x.com/search?q=from%3A${encodeURIComponent(handle)}%20%22%2Farticles%2F%22&src=typed_query&f=live`);
  }
  return unique(urls);
}
