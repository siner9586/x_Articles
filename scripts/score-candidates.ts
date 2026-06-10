import { parse } from 'yaml';
import { readJson, readText, writeJson } from './utils/fs.js';
import { beijingDate } from './utils/time.js';
import { containsAny, unique } from './utils/text.js';
import type { Candidate } from './utils/types.js';

const issueDate = process.env.ISSUE_DATE || beijingDate();
const queryRaw = parse(await readText('data/sources/query_templates.yaml', '{}')) || {};
const signalWords = [...(queryRaw.signal_words_en || []), ...(queryRaw.signal_words_zh || [])];
const topicsList = [...(queryRaw.topics_en || []), ...(queryRaw.topics_zh || [])];

function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }
function weighted(c: Candidate) {
  return clamp(c.source_score * 0.20 + c.information_density_score * 0.20 + c.originality_score * 0.15 + c.trend_score * 0.15 + c.evidence_score * 0.10 + c.heat_score * 0.10 + c.site_fit_score * 0.10);
}

function concreteText(c: Candidate) {
  const topic = c.topics[0] || c.tags[0] || 'AI';
  const org = c.organization || c.source_domain;
  c.core_takeaway = `这篇文章的核心信号是：${topic} 正在通过 ${org} 的公开长文进入可复盘的产品、技术或投资讨论。`;
  c.why_it_matters = `它不是短帖情绪，而是把 ${topic} 放在可验证来源、原始链接和上下文证据中，适合判断该方向是否从概念讨论进入实际工作流。`;
  c.possible_impact = `如果文中的判断继续被后续产品、开源工具或公司博客验证，${topic} 可能影响开发者采用、企业采购、模型部署成本或创业公司定位。`;
  c.what_to_watch_next = `继续追踪同一 cluster 下是否出现官方文档、benchmark、GitHub release、客户案例或反向复盘；没有新证据时不重复入选下一期。`;
  c.reason_selected = c.why_it_matters;
}

function score(c: Candidate): Candidate {
  const text = `${c.title} ${c.summary || ''} ${c.excerpt || ''}`;
  const evidenceCount = (c.evidence_links || []).length;
  const hasSignal = containsAny(text, signalWords);
  const hasTopic = containsAny(text, topicsList) || c.topics.length > 0;
  const hasData = /benchmark|eval|data|chart|graph|architecture|case study|lessons|postmortem|framework|roadmap|cost|latency|inference|评测|数据|架构|案例|复盘|成本/i.test(text);
  c.information_density_score = clamp(45 + (c.excerpt?.length || 0) / 10 + evidenceCount * 5 + (hasData ? 18 : 0));
  c.originality_score = clamp(45 + (hasSignal ? 18 : 0) + (/we learned|lessons|why|how|memo|thesis|复盘|方法论|拆解/i.test(text) ? 14 : 0) + (c.source_platform === 'rss' ? 6 : 0));
  c.trend_score = clamp(42 + c.topics.length * 10 + (hasTopic ? 16 : 0));
  c.evidence_score = clamp(40 + evidenceCount * 10 + (/github|arxiv|benchmark|docs|paper|release|官方|文档/i.test(text + c.evidence_links.join(' ')) ? 16 : 0));
  c.heat_score = clamp(c.engagement?.score || c.engagement?.hn_score || 50);
  c.site_fit_score = clamp(50 + (hasTopic ? 22 : 0) + (/ai|agent|model|llm|coding|inference|multimodal|search|browser|AI|智能体|模型|编程/i.test(text) ? 18 : 0));
  c.total_score = weighted(c);
  concreteText(c);
  if (c.total_score < 40) {
    c.status = 'rejected';
    c.reason_rejected = 'Score below Archive Only threshold or weak fit for article-first AI signal tracking.';
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
