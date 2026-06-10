import { cleanText } from './utils/text.js';
import { normalizeUrl } from './dedupe.js';

export type FeedEntry = {
  title: string;
  link: string;
  description: string;
  published_at: string;
  author: string;
  discovery_method?: 'rss' | 'atom' | 'json_feed';
};

export async function fetchText(url: string, timeoutMs = 5000): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  if (!url) return { ok: false, status: 0, text: '', error: 'empty url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const timeout = new Promise<{ ok: boolean; status: number; text: string; error?: string }>((resolve) => {
    setTimeout(() => resolve({ ok: false, status: 0, text: '', error: 'timeout' }), timeoutMs + 250);
  });
  const request = (async () => {
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': 'x_Articles/0.2 compliant public metadata collector; RSS/Atom/JSONFeed/Sitemap/HTML index only; no paid API',
          'accept': 'application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5'
        }
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (error: any) {
      return { ok: false, status: 0, text: '', error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
    } finally {
      clearTimeout(timer);
    }
  })();
  return Promise.race([request, timeout]);
}

function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  return cleanText((m?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
}

function atomLink(block: string): string {
  const alternate = block.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  if (alternate?.[1]) return alternate[1];
  const any = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return any?.[1] || '';
}

function parseJsonFeed(text: string): FeedEntry[] {
  try {
    const json = JSON.parse(text);
    const items = Array.isArray(json.items) ? json.items : [];
    return items.map((item: any) => ({
      title: cleanText(item.title || item.summary || ''),
      link: normalizeUrl(item.url || item.external_url || ''),
      description: cleanText(item.summary || item.content_text || item.content_html || ''),
      published_at: cleanText(item.date_published || item.date_modified || ''),
      author: cleanText(item.author?.name || json.author?.name || ''),
      discovery_method: 'json_feed' as const
    })).filter((item: FeedEntry) => item.title && item.link);
  } catch {
    return [];
  }
}

export function parseFeed(text: string): FeedEntry[] {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return parseJsonFeed(trimmed).slice(0, 24);

  const out: FeedEntry[] = [];
  const itemBlocks = text.match(/<item[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = text.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of itemBlocks.slice(0, 24)) {
    const title = tag(block, 'title');
    const link = normalizeUrl(tag(block, 'link') || atomLink(block));
    const description = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded');
    const published_at = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || '';
    const author = tag(block, 'author') || tag(block, 'dc:creator') || '';
    if (title && link) out.push({ title, link, description, published_at, author, discovery_method: 'rss' });
  }
  for (const block of entryBlocks.slice(0, 24)) {
    const title = tag(block, 'title');
    const link = normalizeUrl(atomLink(block) || tag(block, 'link'));
    const description = tag(block, 'summary') || tag(block, 'content');
    const published_at = tag(block, 'published') || tag(block, 'updated') || '';
    const author = tag(block, 'name') || tag(block, 'author') || '';
    if (title && link) out.push({ title, link, description, published_at, author, discovery_method: 'atom' });
  }
  return out;
}

export function parseSitemapUrls(xml: string): Array<{ url: string; lastmod: string }> {
  const blocks = xml.match(/<url[\s\S]*?<\/url>/gi) || [];
  if (blocks.length) {
    return blocks.map(block => ({
      url: normalizeUrl(tag(block, 'loc')),
      lastmod: tag(block, 'lastmod')
    })).filter(item => item.url);
  }
  const locs = [...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)];
  return locs.map(m => ({ url: normalizeUrl(cleanText(m[1])), lastmod: '' })).filter(item => item.url);
}

export function extractHtmlMeta(html: string, sourceUrl: string) {
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = cleanText(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ||
    ''
  );
  const ogTitle = cleanText(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
    ''
  );
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || sourceUrl;
  return { title: ogTitle || title, description, canonical_url: normalizeUrl(canonical) };
}
