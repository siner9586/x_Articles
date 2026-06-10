import { cleanText } from './utils/text.js';
import { normalizeUrl } from './dedupe.js';

export async function fetchText(url: string, timeoutMs = 1500): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  if (!url) return { ok: false, status: 0, text: '', error: 'empty url' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const timeout = new Promise<{ ok: boolean; status: number; text: string; error?: string }>((resolve) => {
    setTimeout(() => resolve({ ok: false, status: 0, text: '', error: 'timeout' }), timeoutMs + 150);
  });
  const request = (async () => {
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': 'x_Articles/0.1 compliant RSS metadata collector; no paid API; contact via repo',
          'accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5'
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
  const m = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return m?.[1] || '';
}

export function parseFeed(xml: string): Array<{ title: string; link: string; description: string; published_at: string; author: string }> {
  const out: Array<{ title: string; link: string; description: string; published_at: string; author: string }> = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of [...itemBlocks, ...entryBlocks].slice(0, 12)) {
    const title = tag(block, 'title');
    const link = normalizeUrl(tag(block, 'link') || atomLink(block));
    const description = tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded');
    const published_at = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || '';
    const author = tag(block, 'author') || tag(block, 'dc:creator') || '';
    if (title && link) out.push({ title, link, description, published_at, author });
  }
  return out;
}

export function extractHtmlMeta(html: string, sourceUrl: string) {
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const description = cleanText(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
  const ogTitle = cleanText(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || sourceUrl;
  return { title: ogTitle || title, description, canonical_url: normalizeUrl(canonical) };
}
