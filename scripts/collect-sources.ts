import { parse } from 'yaml';
import { ensureDir, loadYamlList, readText, writeJson } from './utils/fs.js';
import { beijingDate, beijingISOString } from './utils/time.js';
import { cleanText, containsAny, sha1, unique } from './utils/text.js';
import { makeDedupeKey, titleHash } from './dedupe.js';
import { fetchText, extractHtmlMeta } from './fetch-public.js';
import { assignCluster } from './cluster.js';
import type { Candidate, DiscoveryMethod } from './utils/types.js';
import { attachArticleIdentity, canonicalizeUrl, isXArticleUrl, xArticleVerdict } from './x-article.js';
import { parseBackendConfig, runBackends } from './x-backends/index.js';
import type { ArticleDiscoveryResult } from './x-backends/types.js';

const issueDate = process.env.ISSUE_DATE || beijingDate();
const capturedAt = beijingISOString();
const fetchBatchId = process.env.GITHUB_RUN_ID || process.env.X_ARTICLES_FETCH_BATCH_ID || sha1(`${issueDate}|${capturedAt}`);
const liveFetch = process.env.X_ARTICLES_FETCH_LIVE !== 'false';
const attemptIndex = Number(process.env.X_ARTICLES_ATTEMPT_INDEX || 1);
const totalAttempts = Number(process.env.X_ARTICLES_TOTAL_ATTEMPTS || 30);
const finalCompensation = process.env.X_ARTICLES_FINAL_COMPENSATION === 'true' || attemptIndex >= totalAttempts;

const queryRaw = parse(await readText('data/sources/query_templates.yaml', '{}')) || {};
const topics = [...(queryRaw.topics_en || []), ...(queryRaw.topics_zh || [])];
const signalWords = [...(queryRaw.signal_words_en || []), ...(queryRaw.signal_words_zh || [])];
const blockWords = [...(queryRaw.block_words || [])];

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

function sourceFromResult(result: ArticleDiscoveryResult): any {
  const meta = result.source_meta || {};
  return {
    handle: result.author_handle || meta.handle || meta.author_handle || '',
    display_name: result.author || meta.display_name || meta.name || meta.author || 'X Article author',
    name: meta.name || result.author || meta.display_name || 'X Article author',
    organization: meta.organization || '',
    role: meta.role || meta.author_role || '',
    x_url: meta.x_url || (result.author_handle ? `https://x.com/${String(result.author_handle).replace(/^@/, '')}` : ''),
    priority: Number(meta.priority || 76),
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    language: meta.language || 'en'
  };
}

function articleConfidence(result: ArticleDiscoveryResult, title: string, description: string): number {
  let score = 40;
  if (isXArticleUrl(result.canonical_url)) score += 25;
  if (result.article_id) score += 10;
  if (title && !/^x$|^home\s*\/\s*x$/i.test(title)) score += 10;
  if (description.length > 80) score += 8;
  if (result.backend === 'browser_render') score += 6;
  if (result.backend === 'curated_live') score += 5;
  if (result.backend === 'fxtwitter') score += 4;
  if (result.backend === 'nitter_public') score += 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

async function xArticleCandidate(result: ArticleDiscoveryResult): Promise<Candidate | undefined> {
  const articleUrl = canonicalizeUrl(result.canonical_url || result.url || '');
  if (!isXArticleUrl(articleUrl)) return;

  let title = cleanText(result.title || '').replace(/\s*\/\s*X$/i, '');
  let description = cleanText(result.summary_seed || '');
  let status: Candidate['fetch_status'] = result.fetch_status === 'ok' ? 'ok' : 'partial';
  let error = result.fetch_error || '';

  const metaRes = await fetchText(articleUrl, 4200);
  if (metaRes.ok) {
    const meta = extractHtmlMeta(metaRes.text, articleUrl);
    const metaTitle = cleanText(meta.title || '').replace(/\s*\/\s*X$/i, '');
    const metaDescription = cleanText(meta.description || '');
    if (metaTitle && !/^x$|^home\s*\/\s*x$/i.test(metaTitle)) title = metaTitle || title;
    if (metaDescription) description = metaDescription || description;
    status = title || description ? 'partial' : 'failed';
  } else if (!error) {
    error = metaRes.error || `HTTP ${metaRes.status}`;
  }

  if (!title && description) title = description.split(/[。.!?\n]/)[0].slice(0, 120);
  const source = sourceFromResult(result);
  const authorHandle = cleanText(result.author_handle || source.handle || '').replace(/^@/, '');
  const author = cleanText(result.author || source.display_name || (authorHandle ? `@${authorHandle}` : 'X Article author'));
  if (!title || !author || !articleUrl) return;
  if (containsAny(`${title} ${description}`, blockWords)) return;
  if (!hasSignal(source, title, description, articleUrl)) return;

  const topicsFound = inferTopics(title, description);
  const evidence = unique([result.source_url, source.x_url, ...(Array.isArray(source.evidence_links) ? source.evidence_links : [])].filter(Boolean)).slice(0, 8);
  const confidence = articleConfidence(result, title, description);
  const item: Candidate = {
    id: sha1(`${articleUrl}|${title}`),
    canonical_url: articleUrl,
    article_url: articleUrl,
    source_url: result.source_url || articleUrl,
    source_platform: 'x',
    source_type: 'x_article',
    source_domain: 'x.com',
    content_type: 'x_article',
    title,
    author,
    author_handle: authorHandle,
    author_role: cleanText(source.role || ''),
    organization: cleanText(source.organization || ''),
    language: source.language || (/[一-龥]/.test(title + description) ? 'zh' : 'en'),
    published_at: cleanText(result.published_at || ''),
    captured_at: capturedAt,
    discovered_at: result.discovered_at || capturedAt,
    fetched_at: result.fetched_at || capturedAt,
    fetch_batch_id: fetchBatchId,
    run_id: fetchBatchId,
    discovery_run_date: issueDate,
    discovery_method: result.backend as DiscoveryMethod,
    backend: result.backend,
    backend_chain: [result.backend],
    live_fetch: true,
    first_seen_key: sha1(`${issueDate}|${articleUrl}`),
    lastmod: '',
    summary: description.slice(0, 260),
    excerpt: description.slice(0, 520),
    raw_text_available: Boolean(result.raw_text_available),
    topics: topicsFound,
    tags: unique([...(source.tags || []), ...topicsFound, result.backend]).slice(0, 12),
    entities: unique([author, source.organization, ...(topicsFound || [])].filter(Boolean)).slice(0, 12),
    mentioned_companies: source.organization ? [source.organization] : [],
    mentioned_people: author ? [author] : [],
    mentioned_products: [],
    mentioned_papers: [],
    mentioned_repos: evidence.filter((u: string) => /github\.com/i.test(u)),
    evidence_links: evidence,
    heat_metrics: result.heat_metrics || {},
    engagement: {
      bookmarks: Number(result.heat_metrics?.bookmarks || 0) || undefined,
      likes: Number(result.heat_metrics?.likes || 0) || undefined,
      retweets: Number(result.heat_metrics?.reposts || 0) || undefined,
      replies: Number(result.heat_metrics?.replies || 0) || undefined,
      impressions: Number(result.heat_metrics?.views || 0) || undefined,
      score: Number(result.heat_metrics?.bookmarks || result.heat_metrics?.likes || 0) || undefined
    },
    source_score: Number(source.priority || 76),
    information_density_score: 0,
    originality_score: 0,
    trend_score: 0,
    evidence_score: 0,
    heat_score: 0,
    article_confidence_score: confidence,
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

async function run() {
  await ensureDir('data/candidates');
  await ensureDir('data/raw');
  const xAccounts = await loadYamlList('data/sources/x_accounts.yaml');
  const curatedX = await loadYamlList('data/sources/curated_x_articles.yaml');
  const searchQueries = await loadYamlList('data/sources/x_article_search_queries.yaml');
  const backendConfig = parseBackendConfig();
  const candidates: Candidate[] = [];
  const errors: any[] = [];
  let backendOutput = {
    results: [] as ArticleDiscoveryResult[],
    backends_enabled: backendConfig.backends,
    backend_stats: {},
    errors: [] as any[]
  };

  console.log(`[diagnosis] issue_date=${issueDate} attempt=${attemptIndex}/${totalAttempts} final_compensation=${finalCompensation}`);
  console.log(`[diagnosis] sources x_accounts=${xAccounts.length} curated_x_articles=${curatedX.length} search_queries=${searchQueries.length}`);
  console.log(`[diagnosis] live_fetch=${liveFetch} backends=${backendConfig.backends.join(',')}`);
  console.log('[diagnosis] expected backends may include static_http,browser_render,discovery_search,nitter_public,curated_live,fxtwitter');

  if (liveFetch) {
    backendOutput = await runBackends({
      issueDate,
      capturedAt,
      fetchBatchId,
      xAccounts,
      curatedX,
      searchQueries,
      maxAccounts: backendConfig.maxAccounts,
      maxSearchQueries: backendConfig.maxSearchQueries,
      maxCandidates: backendConfig.maxCandidates,
      browserHeadless: backendConfig.browserHeadless
    });
    errors.push(...backendOutput.errors);
    const articleResults = backendOutput.results.filter(r => isXArticleUrl(r.canonical_url || r.url || '')).slice(0, backendConfig.maxCandidates);
    for (const result of articleResults) {
      const c = await xArticleCandidate(result);
      if (c) candidates.push(c);
    }
  } else {
    errors.push({ source: 'pipeline', phase: 'live_fetch_disabled', error: 'Non-live candidate fallback is disabled; no mock, fixture, sample, curated-only, or historical candidates were emitted.' });
  }

  const uniqueByKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const item = attachArticleIdentity(c);
    if (!uniqueByKey.has(item.dedupe_key) && !uniqueByKey.has(item.normalized_url || item.canonical_url)) {
      uniqueByKey.set(item.dedupe_key, item);
      uniqueByKey.set(item.normalized_url || item.canonical_url, item);
    }
  }
  const finalCandidates = [...new Set([...uniqueByKey.values()])].slice(0, backendConfig.maxCandidates);
  await writeJson(`data/candidates/${issueDate}.json`, finalCandidates);

  const backendStats = backendOutput.backend_stats || {};
  const articleUrlsFound = Object.values(backendStats).reduce((sum: number, stat: any) => sum + Number(stat.article_urls_found || 0), 0);
  const fetchFailures = errors.length;
  const emptyReason = finalCandidates.length ? '' : 'no_qualified_new_x_articles_after_live_backend_discovery';

  await writeJson(`data/raw/${issueDate}-run.json`, {
    issue_date: issueDate,
    captured_at: capturedAt,
    attempt_index: attemptIndex,
    total_attempts: totalAttempts,
    final_compensation: finalCompensation,
    sources_scanned: xAccounts.length,
    live_sources_scanned: liveFetch ? Object.values(backendStats).reduce((sum: number, stat: any) => sum + Number(stat.ok || 0) + Number(stat.partial || 0), 0) : 0,
    candidates_count: finalCandidates.length,
    selected_count: 0,
    fetch_failures: fetchFailures,
    errors: errors.slice(0, 200),
    live_fetch: liveFetch,
    fetch_batch_id: fetchBatchId,
    backends_enabled: backendOutput.backends_enabled,
    backend_stats: backendStats,
    candidate_source_policy: 'current live fetch only; history is not read by collect-sources',
    x_sources_attempted: xAccounts.length,
    curated_x_candidates: curatedX.length,
    search_queries_attempted: searchQueries.length,
    x_article_urls_found: articleUrlsFound,
    discovery_sources_attempted: Object.values(backendStats).reduce((sum: number, stat: any) => sum + Number(stat.attempted || 0), 0),
    discovery_sources_scanned: Object.values(backendStats).reduce((sum: number, stat: any) => sum + Number(stat.ok || 0) + Number(stat.partial || 0), 0),
    duplicates_blocked: 0,
    non_x_blocked: 0,
    non_article_blocked: 0,
    history_fallback_used: false,
    mock_used: false,
    empty_issue_generated: false,
    empty_reason: emptyReason,
    selected_policy: 'x_article_only',
    compliance: 'X Articles only. No paid API, no X paid API, no login-wall bypass, no CAPTCHA bypass, no Cloudflare bypass, no paywall circumvention, no full copyrighted article body storage.'
  });

  if (!finalCandidates.length) {
    console.log('[diagnosis] no candidate produced. Likely causes: X dynamic pages inaccessible to static HTTP, browser backend unavailable/blocked, Nitter not configured, curated_x_articles.yaml empty, or discovered URLs failed strict X Article validation. Historical fallback remains disabled.');
  }
  console.log(`Collected ${finalCandidates.length} X Article candidates from ${xAccounts.length} X accounts, ${curatedX.length} curated seeds and ${searchQueries.length} search queries for ${issueDate}. Live fetch: ${liveFetch}. Fetch failures: ${fetchFailures}.`);
}

run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
