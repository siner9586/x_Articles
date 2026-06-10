import { sha1, cleanText, words } from './utils/text.js';

export function normalizeUrl(value = ''): string {
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref','ref_src','fbclid','gclid'].forEach(p => url.searchParams.delete(p));
    return url.toString().replace(/\/$/, '');
  } catch { return value.trim(); }
}

export function getDomain(value = ''): string {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function semanticTitleKey(title = ''): string {
  const stop = new Set(['the','a','an','and','or','of','to','in','for','on','with','by','is','are','how','why','what','we','our']);
  return words(title).filter(w => !stop.has(w)).slice(0, 12).join('-');
}

export function titleHash(title = ''): string { return sha1(semanticTitleKey(title)); }

export function makeDedupeKey(input: { canonical_url?: string; source_url?: string; title?: string; author?: string; cluster_id?: string }) {
  const normalized = normalizeUrl(input.canonical_url || input.source_url || '');
  const sem = semanticTitleKey(input.title || '');
  const author = cleanText(input.author || '').toLowerCase();
  const cluster = input.cluster_id || '';
  return sha1([normalized, sem, author, cluster].join('|'));
}
