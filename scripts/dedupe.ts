import { sha1, cleanText } from './utils/text.js';
import { canonicalizeUrl, normalizedUrl, semanticKey, titleHash as strictTitleHash } from './x-article.js';

export function normalizeUrl(value = ''): string {
  return canonicalizeUrl(value);
}

export function getDomain(value = ''): string {
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function semanticTitleKey(title = ''): string {
  return semanticKey(title, 12);
}

export function titleHash(title = ''): string { return strictTitleHash(title); }

export function makeDedupeKey(input: { canonical_url?: string; source_url?: string; title?: string; author?: string; cluster_id?: string }) {
  const normalized = normalizedUrl(input.canonical_url || input.source_url || '');
  const sem = semanticTitleKey(input.title || '');
  const author = cleanText(input.author || '').toLowerCase();
  const cluster = input.cluster_id || '';
  return sha1([normalized, sem, author, cluster].join('|'));
}
