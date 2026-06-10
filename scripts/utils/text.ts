import crypto from 'node:crypto';

export function cleanText(value = ''): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

export function slugify(value = ''): string {
  return cleanText(value).toLowerCase().replace(/https?:\/\//g, '').replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

export function sha1(value = ''): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);
}

export function unique<T>(items: T[]): T[] { return Array.from(new Set(items.filter(Boolean))); }

export function words(value = ''): string[] {
  return cleanText(value).toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(Boolean);
}

export function containsAny(text: string, terms: string[]): boolean {
  const hay = text.toLowerCase();
  return terms.some(t => hay.includes(String(t).toLowerCase()));
}
