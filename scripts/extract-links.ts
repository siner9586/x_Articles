import { getDomain } from './dedupe.js';

export function extractLinks(text = ''): string[] {
  const matches = text.match(/https?:\/\/[^\s)"'<>]+/g) || [];
  return Array.from(new Set(matches.map(u => u.replace(/[.,;]+$/, ''))));
}

export function isLikelyArticleUrl(url = ''): boolean {
  const d = getDomain(url);
  if (!d) return false;
  if (/github\.com$/.test(d) && !/github\.blog/.test(d)) return false;
  if (/arxiv\.org|openreview\.net|paperswithcode\.com/.test(d)) return false;
  if (/youtube\.com|youtu\.be|podcasts\.apple\.com|spotify\.com/.test(d)) return false;
  if (/\/podcast|\/episode|\/watch\?/.test(url)) return false;
  return true;
}
