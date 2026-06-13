import { parse } from 'yaml';
import { readJson, readText, writeJson } from './utils/fs.js';
import { beijingDate } from './utils/time.js';
import { containsAny, unique } from './utils/text.js';
import type { Candidate } from './utils/types.js';
import { attachArticleIdentity, xArticleVerdict } from './x-article.js';

const issueDate = process.env.ISSUE_DATE || beijingDate();
const queryRaw = parse(await readText('data/sources/query_templates.yaml', '{}')) || {};
const signalWords = [...(queryRaw.signal_words_en || []), ...(queryRaw.signal_words_zh || [])];
const topicsList = [...(queryRaw.topics_en || []), ...(queryRaw.topics_zh || [])];

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }
function metricNumber(c: Candidate, keys: string[]): number {
  for (const key of keys) {
    const value = Number((c.heat_metrics || c.engagement || {})[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function heatScore(c: Candidate) {
  const likes = metricNumber(c, ['likes']);
  const reposts = metricNumber(c, ['reposts', 'retweets']);
  const replies = metricNumber(c, ['replies']);
  const bookmarks = metricNumber(c, ['bookmarks']);
  const views = metricNumber(c, ['views', 'impressions']);
  const raw = likes * 1.2 + reposts * 2.2 + replies * 1.1 + bookmarks * 2.6 + Math.log10(views + 1) * 8;
  return clamp(raw ? 38 + Math.log10(raw + 1) * 22 : 34);
}

function sourceScore(c: Candidate) {
  const followers = metricNumber(c, ['author_followers']);
  const verified = Boolean((c.heat_metrics || {})['author_verified']);
  return clamp((c.source_score || 76) * 0.78 + (followers ? Math.log10(followers + 1) * 5 : 0) + (verified ? 8 : 0));
}

function freshnessScore(c: Candidate) {
  const date = c.published_at || c.discovery_run_date || issueDate;
  if (!date) return 60;
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed)) return c.discovery_run_date === issueDate ? 88 : 55;
  const ageHours = Math.max(0, (Date.now() - parsed) / 36e5);
  if (ageHours <= 24) return 100;
  if (ageHours <= 72) return 82;
  if (ageHours <= 24 * 30) return 62;
  if (ageHours <= 24 * 183) return 42;
  return 8;
}

function articleConfidenceScore(c: Candidate) {
  let score = Number(c.article_confidence_score || 0);
  if (!score) score = 45;
  if (c.article_id) score += 12;
  if (/^https:\/\/x\.com\//.test(c.canonical_url)) score += 10;
  if (c.backend === 'browser_render') score += 8;
  if (c.backend === 'curated_live') score += 7;
  if ((c.summary || c.excerpt || '').length > 100) score += 8;
  if (c.fetch_status === 'failed') score -= 20;
  return clamp(score);
}

function qualityScore(c: Candidate) {
  const text = `${c.title} ${c.summary || ''} ${c.excerpt || ''}`;
  const evidenceCount = (c.evidence_links || []).length;
  const hasSignal = containsAny(text, signalWords);
  const hasTopic = containsAny(text, topicsList) || c.topics.length > 0;
  const hasData = /benchmark|eval|data|chart|graph|architecture|case study|lessons|postmortem|framework|roadmap|cost|latency|inference|评测|数据|架构|案例|复盘|成本/i.test(text);
  const density = clamp(45 + (c.excerpt?.length || 0) / 10 + evidenceCount * 5 + (hasData ? 18 : 0));
  const originality = clamp(45 + (hasSignal ? 18 : 0) + (/we learned|lessons|why|how|memo|thesis|复盘|方法论|拆解/i.test(text) ? 14 : 0));
  const siteFit = clamp(50 + (hasTopic ? 22 : 0) + (/ai|agent|model|llm|coding|inference|multimodal|search|browser|AI|智能体|模型|编程/i.test(text) ? 18 : 0));
  c.information_density_score = density;
  c.originality_score = originality;
  c.trend_score = clamp(42 + c.topics.length * 10 + (hasTopic ? 16 : 0));
  c.evidence_score = clamp(40 + evidenceCount * 10 + (/github|arxiv|benchmark|docs|paper|release|官方|文档/i.test(text + c.evidence_links.join(' ')) ? 16 : 0));
  c.site_fit_score = siteFit;
  return clamp(density * 0.40 + originality * 0.30 + siteFit * 0.30);
}

function lowQualityPenalty(text: string) {
  let penalty = 0;
  if (/(giveaway|airdrop|promo code|discount|sponsored|webinar|register now|subscribe|newsletter|podcast|youtube|breaking\s+news)/i.test(text)) penalty += 28;
  if (text.length < 120) penalty += 12;
  if (!/(how|why|lessons|guide|analysis|framework|architecture|method|launch|research|benchmark|复盘|方法|教程|经验|判断|观点|架构|研究)/i.test(text)) penalty += 8;
  return penalty;
}

function weighted(c: Candidate, text: string) {
  const quality = qualityScore(c);
  const heat = heatScore(c);
  const fresh = freshnessScore(c);
  const source = sourceScore(c);
  const confidence = articleConfidenceScore(c);
  const duplicateRiskPenalty = !c.content_hash || !c.url_hash ? 12 : 0;
  const penalty = duplicateRiskPenalty + lowQualityPenalty(text);
  c.quality_score = quality;
  c.heat_score = heat;
  c.freshness_score = fresh;
  c.article_confidence_score = confidence;
  c.score = clamp(quality * 0.40 + heat * 0.10 + fresh * 0.20 + source * 0.15 + confidence * 0.15 - penalty);
  return c.score;
}

function concreteText(c: Candidate) {
  const topic = c.topics[0] || c.tags[0] || 'AI';
  const org = c.organization || c.source_domain;
  c.core_takeaway = `这篇文章的核心信号是：${topic} 正在通过 ${org} 的公开长文进入可复盘的产品、技术或投资讨论。`;
  c.why_it_matters = `它不是短帖情绪，而是把 ${topic} 放在可验证来源、原始链接和上下文证据中，适合判断该方向是否从概念讨论进入实际工作流。`;
  c.possible_impact = `如果文中的判断继续被后续产品、开源工具或公司博客验证，${topic} 可能影响开发者采用、企业采购、模型部署成本或创业公司定位。`;
  c.what_to_watch_next = `继续追踪同一 cluster 下是否出现官方文档、benchmark、GitHub release、客户案例或反向复盘；没有新证据时不重复入选下一期。`;
  c.reason_selected = c.why_it_matters;
  c.reason_for_selection = c.why_it_matters;
  c.summary_zh = c.summary_zh || c.summary || c.excerpt || '';
  c.summary_en = c.summary_en || c.summary || c.excerpt || '';
}

function score(c: Candidate): Candidate {
  c = attachArticleIdentity(c);
  const verdict = xArticleVerdict(c);
  if (!verdict.ok || c.live_fetch !== true || c.discovery_run_date !== issueDate) {
    return { ...c, status: 'rejected', reason_rejected: `Not a current-run live X Article: ${verdict.reason}` };
  }
  const text = `${c.title} ${c.summary || ''} ${c.excerpt || ''}`;
  c.total_score = weighted(c, text);
  concreteText(c);
  if (c.total_score < 40) {
    c.status = 'rejected';
    c.reason_rejected = 'Score below Archive Only threshold, weak X Article fit, or low-quality/duplicate-risk penalty.';
  } else {
    c.status = 'candidate';
  }
  return c;
}

async function run() {
  const file = `data/candidates/${issueDate}.json`;
  const candidates = await readJson<Candidate[]>(file, []);
  const scored = candidates.map(score).sort((a, b) => b.total_score - a.total_score).map((c, i) => ({ ...c, rank: i + 1, tags: unique(c.tags || []) }));
  await writeJson(file, scored);
  console.log(`Scored ${scored.length} candidates for ${issueDate}.`);
}

run().catch(error => { console.error(error); process.exit(1); });
