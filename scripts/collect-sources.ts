import { parse } from 'yaml';
import { ensureDir, loadYamlList, readText, writeJson } from './utils/fs.js';
import { beijingDate, beijingISOString } from './utils/time.js';
import { cleanText, containsAny, sha1, unique } from './utils/text.js';
import { getDomain, makeDedupeKey, normalizeUrl, titleHash } from './dedupe.js';
import { fetchText, extractHtmlMeta } from './fetch-public.js';
import { extractHrefLinks, extractLinks } from './extract-links.js';
import { assignCluster } from './cluster.js';
import type { Candidate, DiscoveryMethod } from './utils/types.js';
import { attachArticleIdentity, canonicalizeUrl, isXArticleUrl as strictIsXArticleUrl, xArticleVerdict } from './x-article.js';

const issueDate = process.env.ISSUE_DATE || beijingDate();
const capturedAt = beijingISOString();
const fetchBatchId = process.env.GITHUB_RUN_ID || process.env.X_ARTICLES_FETCH_BATCH_ID || sha1(`${issueDate}|${capturedAt}`);
const liveFetch = process.env.X_ARTICLES_FETCH_LIVE !== 'false';

const queryRaw = parse(await readText('data/sources/query_templates.yaml', '{}')) || {};
const topics = [...(queryRaw.topics_en || []), ...(queryRaw.topics_zh || [])];
const signalWords = [...(queryRaw.signal_words_en || []), ...(queryRaw.signal_words_zh || [])];
const blockWords = [...(queryRaw.block_words || [])];

const stats = {
  x_sources_attempted: 0,
  x_sources_scanned: 0,
  x_profile_pages_attempted: 0,
  x_profile_pages_scanned: 0,
  x_article_urls_found: 0,
  curated_x_candidates: 0,
  x_article_metadata_fetches: 0
};

function isXDomain(url = ''): boolean {
  const domain = getDomain(url);
  return domain === 'x.com' || domain === 'twitter.com';
}

function isXArticleUrl(url = ''): boolean {
  return strictIsXArticleUrl(url);
}

function normalizeXArticleUrl(url = ''): string {
  const normalized = canonicalizeUrl(url);
  if (!isXArticleUrl(normalized)) return '';
  return normalized;
}

function extractXArticleUrls(html = '', baseUrl = ''): string[] {
  const hrefs = extractHrefLinks(html, baseUrl);
  const rawUrls = extractLinks(html);
  const encoded = [...html.matchAll(/https?:\\?\/\\?\/(?:x|twitter)\.com\\?\/[^\s"'<>]+/gi)].map(m => m[0].replace(/\\\//g, '/'));
  return unique([...hrefs, ...rawUrls, ...encoded]
    .map(normalizeXArticleUrl)
    .filter(Boolean));
}

function inferTopics(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const found = topics.filter((t: string) => text.includes(String(t).toLowerCase()));
  const mapped: string[] = [];
  if (/agent|智能体|computer use|tool use|mcp|browser|managed agent/i.test(text)) mapped.push('AI Agent');
  if (/coding|developer|software|repo|copilot|cursor|windsurf|claude\.md|编程/i.test(text)) mapped.push('AI Coding');
  if (/reasoning|test-time|inference|推理|think/i.test(text)) mapped.push('Reasoning Models');
  if (/context engineering|context|memory|上下文|记忆/i.test(text)) mapped.push('Context Engineering');
  if (/startup|founder|funding|investment|vc|创业|投资/i.test(text)) mapped.push('Investment');
  if (/safety|alignment|policy|安全|对齐/i.test(text)) mapped.push('Safety');
  return unique([...mapped, ...found]).slice(0, 8);
}

function hasSignal(source: any, title: string, description: string, url = ''): boolean {
  const text = `${title} ${description} ${url}`;
  return containsAny(text, signalWords) ||
    containsAny(text, topics) ||
    containsAny(text, source.tags || []) ||
    /ai|agent|model|coding|inference|llm|claude|context|software|startup|founder|智能体|模型|编程|推理|上下文/i.test(text);
}

async function xArticleCandidate(
  source: any,
  url: string,
  sourceUrl: string,
  method: DiscoveryMethod,
  seed: any = {},
  sourceFetchOk = true,
  sourceError = ''
): Promise<Candidate | undefined> {
  const articleUrl = normalizeXArticleUrl(url || seed.url || seed.source_url || '');
  if (!articleUrl) return;

  let title = cleanText(seed.title || '');
  let description = cleanText(seed.description || seed.summary || seed.excerpt || '');
  let status: Candidate['fetch_status'] = sourceFetchOk ? 'partial' : 'failed';
  let error = sourceError;

  const metaRes = await fetchText(articleUrl, 3500);
  stats.x_article_metadata_fetches += 1;
  if (metaRes.ok) {
    const meta = extractHtmlMeta(metaRes.text, articleUrl);
    title = cleanText(meta.title || title).replace(/\s*\/\s*X$/i, '');
    description = cleanText(meta.description || description);
    status = title || description ? 'partial' : 'failed';
  } else if (!error) {
    error = metaRes.error || `HTTP ${metaRes.status}`;
  }

  const authorHandle = cleanText(seed.author_handle || source.handle || String(seed.author || '').replace(/^@/, ''));
  const author = cleanText(seed.author || source.display_name || source.name || (authorHandle ? `@${authorHandle}` : 'X Article author'));
  if (!title || !author || !articleUrl) return;
  description = description || cleanText(seed.summary || seed.excerpt || '');
  if (!description && status === 'failed') return;

  if (containsAny(`${title} ${description}`, blockWords)) return;
  if (!hasSignal(source, title, description, articleUrl)) return;

  const topicsFound = inferTopics(title, description);
  const evidence = unique([sourceUrl, source.x_url, seed.x_post_url, seed.tweet_url, ...(seed.evidence_links || [])].filter(Boolean)).slice(0, 8);
  const item: Candidate = {
    id: sha1(`${articleUrl}|${title}`),
    canonical_url: articleUrl,
    article_url: articleUrl,
    source_url: sourceUrl || articleUrl,
    source_platform: 'x',
    source_type: 'x_article',
    source_domain: 'x.com',
    content_type: 'x_article',
    title,
    author,
    author_handle: authorHandle,
    author_role: cleanText(source.role || seed.author_role || ''),
    organization: cleanText(source.organization || seed.organization || ''),
    language: source.language || seed.language || (/[一-龥]/.test(title + description) ? 'zh' : 'en'),
    published_at: cleanText(seed.published_at || seed.date || ''),
    captured_at: capturedAt,
    fetched_at: capturedAt,
    fetch_batch_id: fetchBatchId,
    run_id: fetchBatchId,
    discovery_run_date: issueDate,
    discovery_method: method,
    live_fetch: true,
    first_seen_key: sha1(`${issueDate}|${articleUrl}`),
    lastmod: cleanText(seed.lastmod || ''),
    summary: description.slice(0, 260),
    excerpt: description.slice(0, 520),
    raw_text_available: false,
    topics: topicsFound,
    tags: unique([...(source.tags || []), ...(seed.tags || []), ...topicsFound]).slice(0, 12),
    entities: unique([author, source.organization, ...(topicsFound || [])].filter(Boolean)).slice(0, 12),
    mentioned_companies: source.organization ? [source.organization] : [],
    mentioned_people: author ? [author] : [],
    mentioned_products: [],
    mentioned_papers: [],
    mentioned_repos: evidence.filter((u: string) => /github\.com/i.test(u)),
    evidence_links: evidence,
    heat_metrics: {
      bookmarks: Number(seed.bookmarks || 0) || undefined,
      likes: Number(seed.likes || 0) || undefined,
      retweets: Number(seed.retweets || 0) || undefined,
      reposts: Number(seed.reposts || seed.retweets || 0) || undefined,
      replies: Number(seed.replies || 0) || undefined,
      impressions: Number(seed.impressions || 0) || undefined,
      views: Number(seed.views || seed.impressions || 0) || undefined,
      author_followers: Number(seed.author_followers || source.followers || 0) || undefined,
      author_verified: seed.author_verified ?? source.verified ?? undefined,
      score: Number(seed.heat_score || seed.bookmarks || seed.likes || 0) || undefined
    },
    engagement: {
      bookmarks: Number(seed.bookmarks || 0) || undefined,
      likes: Number(seed.likes || 0) || undefined,
      retweets: Number(seed.retweets || seed.reposts || 0) || undefined,
      replies: Number(seed.replies || 0) || undefined,
      impressions: Number(seed.impressions || seed.views || 0) || undefined,
      score: Number(seed.heat_score || seed.bookmarks || seed.likes || 0) || undefined
    },
    source_score: Number(source.priority || seed.priority || 76),
    information_density_score: 0,
    originality_score: 0,
    trend_score: 0,
    evidence_score: 0,
    heat_score: 0,
    site_fit_score: 0,
    total_score: 0,
    cluster_id: '',
    dedupe_key: '',
    title_hash: titleHash(title),
    status: 'candidate',
    fetch_status: status,
    ...(status === 'failed' && error ? { fetch_error: error } : {}),
    first_seen_issue: issueDate,
    last_seen_issue: issueDate
  };
  const verdict = xArticleVerdict(item);
  if (!verdict.ok) return;
  item.cluster_id = assignCluster(item, issueDate);
  item.dedupe_key = makeDedupeKey(item);
  return attachArticleIdentity(item);
}

function xSeedUrls(account: any): string[] {
  const handle = account.handle || '';
  const xUrl = account.x_url || (handle ? `https://x.com/${handle}` : '');
  const urls: string[] = [];
  if (xUrl) urls.push(xUrl);
  if (handle) {
    urls.push(`https://x.com/${handle}/articles`);
    urls.push(`https://x.com/search?q=from%3A${encodeURIComponent(handle)}%20%22x.com%2Fi%2Farticle%22&src=typed_query&f=live`);
    urls.push(`https://x.com/search?q=from%3A${encodeURIComponent(handle)}%20filter%3Alinks%20article&src=typed_query&f=live`);
  }
  return unique(urls);
}

async function scanXAccount(account: any, candidates: Candidate[], errors: any[]) {
  if (!account?.x_url || /TODO|needs_manual_confirmation/i.test(`${account.handle || ''} ${account.verify_status || ''}`)) return;
  for (const seedUrl of xSeedUrls(account)) {
    stats.x_sources_attempted += 1;
    stats.x_profile_pages_attempted += 1;
    const res = await fetchText(seedUrl, 7000);
    if (!res.ok) {
      errors.push({ source: account.handle || account.display_name, phase: 'x_public_scan', url: seedUrl, error: res.error || `HTTP ${res.status}` });
      continue;
    }
    stats.x_sources_scanned += 1;
    stats.x_profile_pages_scanned += 1;
    const urls = extractXArticleUrls(res.text, seedUrl).slice(0, 12);
    stats.x_article_urls_found += urls.length;
    for (const articleUrl of urls) {
      const c = await xArticleCandidate(account, articleUrl, seedUrl, seedUrl.includes('/search?') ? 'x_search' : seedUrl.endsWith('/articles') ? 'x_articles_tab' : 'x_profile', {}, true, '');
      if (c) candidates.push(c);
    }
  }
}

async function scanCuratedXArticle(seed: any, candidates: Candidate[], errors: any[]) {
  const url = seed.url || seed.source_url || seed.link;
  if (!url || !isXArticleUrl(url)) return;
  stats.x_sources_attempted += 1;
  stats.curated_x_candidates += 1;
  const source = {
    handle: seed.author_handle || String(seed.author || '').replace(/^@/, ''),
    display_name: seed.author || seed.source || 'Curated X Article',
    name: seed.source || seed.author || 'Curated X Article',
    organization: seed.organization || '',
    role: seed.author_role || '',
    x_url: seed.author_handle ? `https://x.com/${String(seed.author_handle).replace(/^@/, '')}` : '',
    priority: seed.priority || 82,
    tags: seed.tags || [],
    language: seed.language || 'en'
  };
  const c = await xArticleCandidate(source, url, seed.source_url || url, 'curated_x', seed, true, '');
  if (c) candidates.push(c);
  else errors.push({ source: seed.author || seed.source || 'curated_x', phase: 'curated_x_verify', url, error: 'not a valid X Article candidate or weak signal' });
}

async function run() {
  await ensureDir('data/candidates');
  await ensureDir('data/raw');
  const xAccounts = await loadYamlList('data/sources/x_accounts.yaml');
  const curatedX = await loadYamlList('data/sources/curated_x_articles.yaml');
  const candidates: Candidate[] = [];
  const errors: any[] = [];

  if (liveFetch) {
    const concurrency = 5;
    let index = 0;
    async function worker() {
      while (index < xAccounts.length) {
        const account = xAccounts[index++];
        await scanXAccount(account, candidates, errors);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    for (const seed of curatedX) await scanCuratedXArticle(seed, candidates, errors);
  } else {
    errors.push({ source: 'pipeline', phase: 'live_fetch_disabled', error: 'Non-live candidate fallback is disabled; no mock, fixture, sample, curated-only, or historical candidates were emitted.' });
  }

  const uniqueByKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const item = attachArticleIdentity(c);
    if (!uniqueByKey.has(item.dedupe_key)) uniqueByKey.set(item.dedupe_key, item);
  }
  const finalCandidates = [...uniqueByKey.values()];
  await writeJson(`data/candidates/${issueDate}.json`, finalCandidates);
  await writeJson(`data/raw/${issueDate}-run.json`, {
    issue_date: issueDate,
    captured_at: capturedAt,
    sources_scanned: xAccounts.length,
    live_sources_scanned: liveFetch ? stats.x_sources_scanned : 0,
    candidates_count: finalCandidates.length,
    fetch_failures: errors.length,
    errors: errors.slice(0, 160),
    live_fetch: liveFetch,
    fetch_batch_id: fetchBatchId,
    candidate_source_policy: 'current live fetch only; history is not read by collect-sources',
    ...stats,
    discovery_sources_attempted: stats.x_sources_attempted,
    discovery_sources_scanned: stats.x_sources_scanned + stats.curated_x_candidates,
    selected_policy: 'x_article_only',
    compliance: 'X Articles only. No paid API, no X paid API, no login-wall bypass, no CAPTCHA bypass, no Cloudflare bypass, no paywall circumvention, no full copyrighted article body storage.'
  });
  console.log(`Collected ${finalCandidates.length} X Article candidates from ${xAccounts.length} X accounts and ${curatedX.length} curated seeds for ${issueDate}. Live fetch: ${liveFetch}. Fetch failures: ${errors.length}.`);
}

run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
