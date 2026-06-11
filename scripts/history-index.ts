import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, listFiles, readJson, writeJson } from './utils/fs.js';
import { beijingISOString } from './utils/time.js';
import {
  attachArticleIdentity,
  canonicalizeUrl,
  contentHash,
  extractXArticleId,
  nearContentHash,
  nearTitleHash,
  normalizedUrl,
  textSimilarity,
  titleHash,
  urlHash,
  authorTitleHash
} from './x-article.js';

export type ShownIndexEntry = {
  canonical_url: string;
  normalized_url: string;
  article_id: string;
  url_hash: string;
  content_hash: string;
  title_hash: string;
  author_title_hash: string;
  near_title_hash: string;
  near_content_hash: string;
  author: string;
  title: string;
  summary?: string;
  shown_date: string;
  source_file: string;
};

export function selectedItems(issue: any): any[] {
  return [
    ...(Array.isArray(issue?.must_read) ? issue.must_read : []),
    ...(Array.isArray(issue?.worth_reading) ? issue.worth_reading : []),
    ...(Array.isArray(issue?.signal_watch) ? issue.signal_watch : [])
  ];
}

export async function buildShownIndex(currentDateToExclude = ''): Promise<ShownIndexEntry[]> {
  const files = await listFiles('data/issues', '.json');
  const entries: ShownIndexEntry[] = [];
  for (const file of files) {
    const issue = await readJson<any>(file, null);
    const shown_date = issue?.metadata?.issue_date || path.basename(file, '.json');
    if (!shown_date || shown_date === currentDateToExclude) continue;
    for (const raw of selectedItems(issue)) {
      const item = attachArticleIdentity(raw || {});
      const canonical_url = canonicalizeUrl(item.canonical_url || item.article_url || '');
      const title = String(item.title || '');
      const author = String(item.author || '');
      if (!canonical_url && !title) continue;
      entries.push({
        canonical_url,
        normalized_url: normalizedUrl(canonical_url),
        article_id: item.article_id || extractXArticleId(canonical_url),
        url_hash: item.url_hash || urlHash(canonical_url),
        content_hash: item.content_hash || contentHash(item),
        title_hash: item.title_hash || titleHash(title),
        author_title_hash: item.author_title_hash || authorTitleHash(author, title),
        near_title_hash: item.near_title_hash || nearTitleHash(title),
        near_content_hash: item.near_content_hash || nearContentHash(item),
        author,
        title,
        summary: item.summary || item.summary_zh || item.summary_en || '',
        shown_date,
        source_file: file
      });
    }
  }
  const deduped = new Map<string, ShownIndexEntry>();
  for (const entry of entries) {
    const key = entry.url_hash || entry.author_title_hash || `${entry.shown_date}:${entry.title_hash}`;
    if (!deduped.has(key)) deduped.set(key, entry);
  }
  return [...deduped.values()].sort((a, b) => `${a.shown_date}:${a.title}`.localeCompare(`${b.shown_date}:${b.title}`));
}

export async function writeShownIndex(entries: ShownIndexEntry[]) {
  await writeJson('data/state/shown-index.json', entries);
}

export async function rebuildShownIndex(currentDateToExclude = '') {
  const index = await buildShownIndex(currentDateToExclude);
  await writeShownIndex(index);
  return index;
}

export function duplicateReason(candidate: any, history: ShownIndexEntry[]): string {
  const item = attachArticleIdentity(candidate || {});
  const title = item.title || '';
  const summary = item.summary || item.summary_zh || item.summary_en || item.excerpt || '';
  for (const h of history) {
    if (item.normalized_url && h.normalized_url && item.normalized_url === h.normalized_url) return `historical normalized_url ${h.source_file}`;
    if (item.article_id && h.article_id && item.article_id === h.article_id) return `historical article_id ${h.source_file}`;
    if (item.url_hash && h.url_hash && item.url_hash === h.url_hash) return `historical url_hash ${h.source_file}`;
    if (item.content_hash && h.content_hash && item.content_hash === h.content_hash) return `historical content_hash ${h.source_file}`;
    if (item.title_hash && h.title_hash && item.title_hash === h.title_hash) return `historical title_hash ${h.source_file}`;
    if (item.author_title_hash && h.author_title_hash && item.author_title_hash === h.author_title_hash) return `historical author_title_hash ${h.source_file}`;
    if (item.near_title_hash && h.near_title_hash && item.near_title_hash === h.near_title_hash) return `historical near_title_hash ${h.source_file}`;
    if (item.near_content_hash && h.near_content_hash && item.near_content_hash === h.near_content_hash) return `historical near_content_hash ${h.source_file}`;
    if (textSimilarity(title, h.title) >= 0.82) return `near duplicate title ${h.source_file}`;
    if (summary && h.summary && textSimilarity(summary, h.summary) >= 0.86) return `near duplicate summary ${h.source_file}`;
  }
  return '';
}

export async function writeUsedItemsCompat(entries: ShownIndexEntry[]) {
  await writeJson('data/archive/used_items.json', entries.map(entry => ({
    canonical_url: entry.canonical_url,
    normalized_url: entry.normalized_url,
    article_id: entry.article_id,
    url_hash: entry.url_hash,
    content_hash: entry.content_hash,
    title_hash: entry.title_hash,
    author_title_hash: entry.author_title_hash,
    near_title_hash: entry.near_title_hash,
    near_content_hash: entry.near_content_hash,
    title: entry.title,
    author: entry.author,
    issue_date: entry.shown_date,
    source_file: entry.source_file,
    used_as: 'shown'
  })));
}

export async function appendRunLog(event: Record<string, any>) {
  const line = JSON.stringify({ logged_at: beijingISOString(), ...event }) + '\n';
  await ensureDir('data/state');
  await appendFile('data/state/run-log.jsonl', line, 'utf8');
}

export async function writeLatestSuccess(issue: any) {
  await writeJson('data/state/latest-success.json', {
    publish_date: issue?.metadata?.issue_date,
    generated_at: issue?.metadata?.generated_at,
    selected_count: issue?.metadata?.selected_count || 0,
    issue_file: issue?.metadata?.issue_date ? `data/issues/${issue.metadata.issue_date}.json` : '',
    content_file: issue?.metadata?.issue_date ? `content/issues/${issue.metadata.issue_date}.md` : '',
    timezone: issue?.metadata?.timezone || 'Asia/Shanghai'
  });
}
