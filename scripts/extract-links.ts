import { getDomain, normalizeUrl } from './dedupe.js';

function absoluteUrl(href: string, baseUrl = ''): string {
  try { return normalizeUrl(new URL(href, baseUrl || undefined).toString()); } catch { return normalizeUrl(href); }
}

export function extractLinks(text = ''): string[] {
  const matches = text.match(/https?:\/\/[^\s)"'<>]+/g) || [];
  return Array.from(new Set(matches.map(u => normalizeUrl(u.replace(/[.,;]+$/, '')))));
}

export function extractHrefLinks(html = '', baseUrl = ''): string[] {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map(m => absoluteUrl(m[1], baseUrl))
    .filter(Boolean);
  return Array.from(new Set(links));
}

export function isLikelyArticleUrl(url = ''): boolean {
  const d = getDomain(url);
  if (!d) return false;
  if (/\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|mp3|mp4|mov|avi)(\?|$)/i.test(url)) return false;
  if (/github\.com$/.test(d) && !/github\.blog/.test(d)) return false;
  if (/arxiv\.org|openreview\.net|paperswithcode\.com/.test(d)) return false;
  if (/youtube\.com|youtu\.be|podcasts\.apple\.com|spotify\.com/.test(d)) return false;
  if (/x\.com|twitter\.com/.test(d)) return /\/articles?\//i.test(url) || /\/i\/article/i.test(url);
  if (/\/(podcast|episode|watch|tag|tags|category|categories|author|authors|about|careers|jobs|privacy|terms)(\/|$|\?)/i.test(url)) return false;
  const path = (() => { try { return new URL(url).pathname; } catch { return ''; } })();
  if (!path || path === '/') return false;
  return true;
}
