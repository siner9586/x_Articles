import { parse } from 'yaml';
import { ensureDir, loadYamlList, readText, writeJson } from './utils/fs.js';
import { beijingDate, beijingISOString } from './utils/time.js';
import { cleanText, containsAny, sha1, unique } from './utils/text.js';
import { getDomain, makeDedupeKey, normalizeUrl, titleHash } from './dedupe.js';
import { fetchText, parseFeed, parseSitemapUrls, extractHtmlMeta } from './fetch-public.js';
import { extractHrefLinks, extractLinks, isLikelyArticleUrl } from './extract-links.js';
import { assignCluster } from './cluster.js';
import type { Candidate, ContentType, DiscoveryMethod, SourcePlatform } from './utils/types.js';

const issueDate = process.env.ISSUE_DATE || beijingDate();
const capturedAt = beijingISOString();
const liveFetch = process.env.X_ARTICLES_FETCH_LIVE === 'true';
const allowCuratedInputs = process.env.X_ARTICLES_ALLOW_CURATED_INPUTS === 'true';
const sourceFiles = [
  'data/sources/company_sources.yaml',
  'data/sources/external_sources.yaml',
  'data/sources/media.yaml',
  'data/sources/vc_sources.yaml',
  'data/sources/research_sources.yaml'
];

const queryRaw = parse(await readText('data/sources/query_templates.yaml', '{}')) || {};
const topics = [...(queryRaw.topics_en || []), ...(queryRaw.topics_zh || [])];
const signalWords = [...(queryRaw.signal_words_en || []), ...(queryRaw.signal_words_zh || [])];
const blockWords = [...(queryRaw.block_words || [])];

const stats = {
  rss_sources_attempted: 0,
  rss_sources_scanned: 0,
  sitemap_sources_attempted: 0,
  sitemap_sources_scanned: 0,
  html_index_sources_attempted: 0,
  html_index_sources_scanned: 0,
  article_metadata_fetches: 0
};

function contentTypeFor(source: any): ContentType | '' {
  const cat = `${source.category || ''} ${source.name || ''}`.toLowerCase();
  if (source.use_as === 'evidence_only') return '';
  if (cat.includes('media') || cat.includes('newsletter') || cat.includes('analysis')) return 'media_article';
  if (cat.includes('vc') || cat.includes('startup')) return 'vc_article';
  if (cat.includes('research')) return 'research_blog_article';
  if (cat.includes('company') || cat.includes('framework') || cat.includes('platform')) return 'company_blog_article';
  return 'external_article';
}

function inferTopics(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const found = topics.filter((t: string) => text.includes(String(t).toLowerCase()));
  const mapped: string[] = [];
  if (/agent|智能体|computer use|tool use|mcp|browser/i.test(text)) mapped.push('AI Agent');
  if (/coding|developer|software|repo|copilot|cursor|windsurf|编程/i.test(text)) mapped.push('AI Coding');
  if (/reasoning|test-time|inference|推理/i.test(text)) mapped.push('Reasoning Models');
  if (/multimodal|image|video|voice|语音|多模态/i.test(text)) mapped.push('Multimodal');
  if (/search|browser|搜索|浏览器/i.test(text)) mapped.push('AI Search');
  if (/infra|gpu|serving|database|vector|rag|基础设施/i.test(text)) mapped.push('AI Infra');
  if (/startup|funding|investment|vc|创业|投资/i.test(text)) mapped.push('Investment');
  if (/safety|alignment|policy|安全|对齐/i.test(text)) mapped.push('Safety');
  return unique([...mapped, ...found]).slice(0, 8);
}

function hasSignal(source: any, title: string, description: string, url = ''): boolean {
  const text = `${title} ${description} ${url}`;
  return containsAny(text, signalWords) ||
    containsAny(text, topics) ||
    containsAny(text, source.tags || []) ||
    /ai|agent|model|coding|inference|llm|multimodal|search|browser|benchmark|eval|智能体|模型|编程|推理|多模态/i.test(text);
}

function fallbackTitleFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    return cleanText(decodeURIComponent(path.replace(/[-_]+/g, ' ')));
  } catch {
    return '';
  }
}

function baseCandidate(
  source: any,
  entry: any,
  platform: SourcePlatform,
  status: Candidate['fetch_status'],
  error = '',
  isLive = false
): Candidate | undefined {
  const title = cleanText(entry.title || '');
  const description = cleanText(entry.description || entry.excerpt || '');
  const link = normalizeUrl(entry.link || entry.url || '');
  if (!title || !link) return;
  const blocked = containsAny(`${title} ${description}`, blockWords);
  const ctype = entry.content_type || contentTypeFor(source);
  if (!ctype || blocked || !isLikelyArticleUrl(link)) return;
  if (isLive && !hasSignal(source, title, description, link)) return;

  const topicsFound = inferTopics(title, description);
  const sourceDomain = getDomain(link) || getDomain(source.homepage_url || source.blog_url || '');
  const evidence = unique([...extractLinks(description), source.blog_url, source.homepage_url].filter(Boolean)).slice(0, 8);
  const item: Candidate = {
    id: sha1(`${link}|${title}`),
    canonical_url: link,
    source_url: entry.source_url || source.rss_url || source.blog_url || link,
    source_platform: platform,
    source_type: source.category || platform,
    source_domain: sourceDomain,
    content_type: ctype,
    title,
    author: cleanText(entry.author || source.name || ''),
    organization: source.name || '',
    language: /[\u4e00-\u9fa5]/.test(title + description) ? 'zh' : 'en',
    published_at: cleanText(entry.published_at || entry.lastmod || ''),
    captured_at: capturedAt,
    discovery_run_date: issueDate,
    discovery_method: entry.discovery_method || platform as DiscoveryMethod,
    live_fetch: Boolean(isLive),
    first_seen_key: sha1(`${issueDate}|${link}`),
    lastmod: entry.lastmod || '',
    summary: description.slice(0, 260) || `Public article metadata collected from ${source.name}.`,
    excerpt: description.slice(0, 420),
    raw_text_available: false,
    topics: topicsFound,
    tags: unique([...(source.tags || []), ...topicsFound]).slice(0, 12),
    entities: unique([source.name, ...(topicsFound || [])]).slice(0, 12),
    mentioned_companies: source.name ? [source.name] : [],
    mentioned_people: [],
    mentioned_products: [],
    mentioned_papers: evidence.filter(u => /arxiv|openreview|paper/i.test(u)),
    mentioned_repos: evidence.filter(u => /github\.com/i.test(u)),
    evidence_links: evidence,
    engagement: {},
    source_score: Number(source.priority || 60),
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
    first_seen_issue: issueDate,
    last_seen_issue: issueDate,
    ...(error ? { fetch_error: error } : {})
  };
  item.cluster_id = assignCluster(item, issueDate);
  item.dedupe_key = makeDedupeKey(item);
  return item;
}

function candidateSitemaps(source: any): string[] {
  const seeds = [source.sitemap_url, source.rss_url, source.blog_url, source.homepage_url].filter(Boolean);
  const out: string[] = [];
  for (const seed of seeds) {
    try {
      const u = new URL(seed);
      if (/sitemap.*\.xml$/i.test(u.pathname)) out.push(u.toString());
      out.push(`${u.origin}/sitemap.xml`, `${u.origin}/sitemap_index.xml`);
    } catch {}
  }
  return unique(out).slice(0, 4);
}

async function candidateFromUrl(source: any, url: string, method: 'sitemap' | 'html_index', sourceUrl: string, lastmod = ''): Promise<Candidate | undefined> {
  const res = await fetchText(url, 3500);
  stats.article_metadata_fetches += 1;
  const meta = res.ok ? extractHtmlMeta(res.text, url) : { title: fallbackTitleFromUrl(url), description: '', canonical_url: url };
  const title = meta.title || fallbackTitleFromUrl(url);
  if (!title) return;
  return baseCandidate(source, {
    title,
    link: meta.canonical_url || url,
    description: meta.description,
    published_at: lastmod,
    lastmod,
    source_url: sourceUrl,
    discovery_method: method
  }, method === 'sitemap' ? 'sitemap' : 'html_index', res.ok ? 'partial' : 'failed', res.ok ? '' : res.error || '', true);
}

async function scanFeed(source: any, candidates: Candidate[], errors: any[]) {
  if (!source.rss_url) return;
  stats.rss_sources_attempted += 1;
  const res = await fetchText(source.rss_url, 6000);
  if (!res.ok) {
    errors.push({ source: source.name, phase: 'rss', url: source.rss_url, error: res.error || `HTTP ${res.status}` });
    return;
  }
  stats.rss_sources_scanned += 1;
  const entries = parseFeed(res.text).slice(0, 12);
  for (const entry of entries) {
    const platform: SourcePlatform = entry.discovery_method === 'json_feed' ? 'json_feed' : 'rss';
    const c = baseCandidate(source, { ...entry, source_url: source.rss_url }, platform, 'partial', '', true);
    if (c) candidates.push(c);
  }
}

async function scanSitemaps(source: any, candidates: Candidate[], errors: any[]) {
  for (const sitemapUrl of candidateSitemaps(source)) {
    stats.sitemap_sources_attempted += 1;
    const res = await fetchText(sitemapUrl, 6000);
    if (!res.ok) {
      errors.push({ source: source.name, phase: 'sitemap', url: sitemapUrl, error: res.error || `HTTP ${res.status}` });
      continue;
    }
    stats.sitemap_sources_scanned += 1;
    let urls = parseSitemapUrls(res.text);
    const nested = urls.filter(item => /sitemap.*\.xml/i.test(item.url)).slice(0, 3);
    for (const child of nested) {
      const childRes = await fetchText(child.url, 5000);
      if (childRes.ok) urls = urls.concat(parseSitemapUrls(childRes.text));
    }
    const articleUrls = unique(urls
      .filter(item => isLikelyArticleUrl(item.url))
      .sort((a, b) => String(b.lastmod || '').localeCompare(String(a.lastmod || '')))
      .map(item => item.url)).slice(0, 10);
    for (const url of articleUrls) {
      const lastmod = urls.find(item => item.url === url)?.lastmod || '';
      const c = await candidateFromUrl(source, url, 'sitemap', sitemapUrl, lastmod);
      if (c) candidates.push(c);
    }
  }
}

async function scanHtmlIndex(source: any, candidates: Candidate[], errors: any[]) {
  const indexUrl = source.blog_url || source.homepage_url;
  if (!indexUrl) return;
  stats.html_index_sources_attempted += 1;
  const res = await fetchText(indexUrl, 6000);
  if (!res.ok) {
    errors.push({ source: source.name, phase: 'html_index', url: indexUrl, error: res.error || `HTTP ${res.status}` });
    return;
  }
  stats.html_index_sources_scanned += 1;
  const links = extractHrefLinks(res.text, indexUrl).filter(isLikelyArticleUrl).slice(0, 12);
  for (const url of links) {
    const c = await candidateFromUrl(source, url, 'html_index', indexUrl);
    if (c) candidates.push(c);
  }
}

async function run() {
  await ensureDir('data/candidates');
  await ensureDir('data/raw');
  const sources = (await Promise.all(sourceFiles.map(loadYamlList))).flat();
  const manual = await loadYamlList('data/sources/manual_links.yaml');
  const curatedX = await loadYamlList('data/sources/curated_x_articles.yaml');
  const curatedExternal = await loadYamlList('data/sources/curated_external_articles.yaml');
  const candidates: Candidate[] = [];
  const errors: any[] = [];

  if (!liveFetch || allowCuratedInputs) {
    for (const item of [...manual, ...curatedExternal]) {
      const c = baseCandidate({ name: item.source || 'manual', category: 'manual_external', priority: 72, tags: item.tags || [] }, { ...item, link: item.url, discovery_method: 'manual' }, 'manual', 'skipped', '', false);
      if (c) candidates.push(c);
    }
    for (const item of curatedX) {
      const c = baseCandidate({ name: item.author || 'curated X Article', category: 'x_article', priority: 76, tags: item.tags || [] }, { ...item, link: item.url, discovery_method: 'curated_x' }, 'x', 'skipped', '', false);
      if (c) candidates.push({ ...c, content_type: 'x_article', source_type: 'x_article' });
    }
  }

  const autoSources = liveFetch ? sources.filter(s => s && s.use_as !== 'evidence_only') : [];
  const concurrency = 6;
  let index = 0;
  async function worker() {
    while (index < autoSources.length) {
      const source = autoSources[index++];
      await scanFeed(source, candidates, errors);
      await scanSitemaps(source, candidates, errors);
      await scanHtmlIndex(source, candidates, errors);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const uniqueByKey = new Map<string, Candidate>();
  for (const c of candidates) if (!uniqueByKey.has(c.dedupe_key)) uniqueByKey.set(c.dedupe_key, c);
  const finalCandidates = [...uniqueByKey.values()];
  await writeJson(`data/candidates/${issueDate}.json`, finalCandidates);
  await writeJson(`data/raw/${issueDate}-run.json`, {
    issue_date: issueDate,
    captured_at: capturedAt,
    sources_scanned: sources.length,
    live_sources_scanned: autoSources.length,
    candidates_count: finalCandidates.length,
    fetch_failures: errors.length,
    errors: errors.slice(0, 120),
    live_fetch: liveFetch,
    ...stats,
    discovery_sources_attempted: stats.rss_sources_attempted + stats.sitemap_sources_attempted + stats.html_index_sources_attempted,
    discovery_sources_scanned: stats.rss_sources_scanned + stats.sitemap_sources_scanned + stats.html_index_sources_scanned,
    compliance: 'No paid API, no X paid API, no login-wall bypass, no CAPTCHA bypass, no Cloudflare bypass, no paywall circumvention, no full copyrighted article body storage.'
  });
  console.log(`Collected ${finalCandidates.length} candidates from ${sources.length} sources for ${issueDate}. Live fetch: ${liveFetch}. Fetch failures: ${errors.length}.`);
}

run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
