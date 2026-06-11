import { cleanText, sha1, words } from './utils/text.js';

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.x.com', 'mobile.twitter.com']);
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'ref_src',
  'fbclid',
  'gclid',
  's',
  't'
];

const TITLE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'by', 'is', 'are',
  'how', 'why', 'what', 'we', 'our', 'from', 'this', 'that', 'these', 'those', 'as', 'at'
]);

export type XArticleVerdict = {
  ok: boolean;
  canonical_url: string;
  normalized_url: string;
  article_id: string;
  reason: string;
};

export function canonicalizeUrl(value = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    url.protocol = 'https:';
    url.hash = '';
    for (const param of TRACKING_PARAMS) url.searchParams.delete(param);
    if ([...url.searchParams.keys()].length > 0 && X_HOSTS.has(url.hostname.replace(/^www\./i, '').toLowerCase())) {
      url.search = '';
    }
    let host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'twitter.com' || host === 'mobile.twitter.com' || host === 'mobile.x.com') host = 'x.com';
    url.hostname = host;
    url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/g, '');
    return url.toString().replace(/\/$/g, '');
  } catch {
    return raw.replace(/[?#].*$/g, '').replace(/\/$/g, '');
  }
}

export function normalizedUrl(value = ''): string {
  return canonicalizeUrl(value).toLowerCase();
}

export function urlHash(value = ''): string {
  return sha1(normalizedUrl(value));
}

export function extractXArticleId(value = ''): string {
  const url = canonicalizeUrl(value);
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const i = parts.findIndex(part => /^articles?$/i.test(part));
    if (parts[0] === 'i' && i === 1 && parts[2]) return cleanText(parts.slice(2).join('/')).toLowerCase();
    if (i > 0 && parts[i + 1]) return cleanText(`${parts[0]}/${parts.slice(i + 1).join('/')}`).toLowerCase();
    return '';
  } catch {
    return '';
  }
}

export function isXArticleUrl(value = ''): boolean {
  const url = canonicalizeUrl(value);
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'x.com') return false;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) return false;
    if (parts.includes('status') || parts.includes('statuses') || parts.includes('video')) return false;
    if (parts[0] === 'compose' && parts[1] === 'articles') return false;
    return Boolean(extractXArticleId(url)) && (
      /^\/i\/articles?\//i.test(parsed.pathname) ||
      /^\/[^/]+\/articles?\//i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function isForbiddenPrimaryUrl(value = ''): boolean {
  const url = canonicalizeUrl(value);
  if (!url) return true;
  if (/youtube\.com|youtu\.be|substack\.com|newsletter|podcast|spotify\.com|apple\.com\/podcasts/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'x.com') return true;
    return !isXArticleUrl(url);
  } catch {
    return true;
  }
}

export function xArticleVerdict(item: any): XArticleVerdict {
  const inputUrl = item?.canonical_url || item?.article_url || item?.url || item?.link || '';
  const canonical_url = canonicalizeUrl(inputUrl);
  const article_id = extractXArticleId(canonical_url);
  const normalized_url = normalizedUrl(canonical_url);
  if (!canonical_url) return { ok: false, canonical_url, normalized_url, article_id, reason: 'missing_url' };
  if (!isXArticleUrl(canonical_url)) return { ok: false, canonical_url, normalized_url, article_id, reason: 'not_x_article_url' };
  if (item?.content_type && item.content_type !== 'x_article') return { ok: false, canonical_url, normalized_url, article_id, reason: 'content_type_not_x_article' };
  if (item?.source_platform && item.source_platform !== 'x') return { ok: false, canonical_url, normalized_url, article_id, reason: 'source_platform_not_x' };
  if (item?.source_type && item.source_type !== 'x_article') return { ok: false, canonical_url, normalized_url, article_id, reason: 'source_type_not_x_article' };
  return { ok: true, canonical_url, normalized_url, article_id, reason: 'x_article_url' };
}

export function semanticWords(value = ''): string[] {
  return words(value).filter(w => !TITLE_STOP_WORDS.has(w)).slice(0, 48);
}

export function semanticKey(value = '', limit = 16): string {
  return semanticWords(value).slice(0, limit).join('-');
}

export function hashText(value = ''): string {
  return sha1(cleanText(value).toLowerCase());
}

export function titleHash(title = ''): string {
  return sha1(semanticKey(title, 18));
}

export function nearTitleHash(title = ''): string {
  return sha1([...new Set(semanticWords(title))].sort().slice(0, 18).join('-'));
}

export function contentHash(item: any): string {
  const text = cleanText([
    item?.title,
    item?.author,
    item?.summary,
    item?.summary_zh,
    item?.summary_en,
    item?.excerpt
  ].filter(Boolean).join(' '));
  return sha1(text.toLowerCase());
}

export function nearContentHash(item: any): string {
  const text = cleanText([item?.summary, item?.summary_zh, item?.summary_en, item?.excerpt].filter(Boolean).join(' '));
  return sha1([...new Set(semanticWords(text))].sort().slice(0, 40).join('-'));
}

export function authorTitleHash(author = '', title = ''): string {
  return sha1(`${cleanText(author).toLowerCase()}|${semanticKey(title, 18)}`);
}

export function textSimilarity(a = '', b = ''): number {
  const aw = new Set(semanticWords(a));
  const bw = new Set(semanticWords(b));
  if (!aw.size || !bw.size) return 0;
  let intersection = 0;
  for (const w of aw) if (bw.has(w)) intersection += 1;
  const union = aw.size + bw.size - intersection;
  return union ? intersection / union : 0;
}

export function attachArticleIdentity<T extends Record<string, any>>(item: T): T & Record<string, any> {
  const verdict = xArticleVerdict(item);
  const canonical_url = verdict.canonical_url || canonicalizeUrl(item.canonical_url || item.article_url || '');
  const title = cleanText(item.title || '');
  const author = cleanText(item.author || '');
  return {
    ...item,
    article_url: canonical_url,
    canonical_url,
    normalized_url: normalizedUrl(canonical_url),
    article_id: verdict.article_id || extractXArticleId(canonical_url),
    url_hash: urlHash(canonical_url),
    title_hash: titleHash(title),
    near_title_hash: nearTitleHash(title),
    content_hash: contentHash(item),
    near_content_hash: nearContentHash(item),
    author_title_hash: authorTitleHash(author, title)
  };
}
