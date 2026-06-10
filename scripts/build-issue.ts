import { promises as fs } from 'node:fs';
import { buildClusters } from './cluster.js';
import { listFiles, loadYamlList, readJson, writeJson } from './utils/fs.js';
import { beijingDate, beijingISOString } from './utils/time.js';
import { generateSiteData } from './generate-site-data.js';
import type { Candidate } from './utils/types.js';

const issueDate = process.env.ISSUE_DATE || beijingDate();
const allowed = new Set(['x_article','external_article','company_blog_article','media_article','vc_article','research_blog_article']);

async function sourceStats() {
  const sourceFiles = ['company_sources.yaml','external_sources.yaml','media.yaml','vc_sources.yaml','research_sources.yaml','x_accounts.yaml'];
  const lists = await Promise.all(sourceFiles.map(f => loadYamlList(`data/sources/${f}`)));
  return { total: lists.flat().length, files: sourceFiles };
}

function classify(items: Candidate[]) {
  const must_read = items.filter(i => i.total_score >= 85).slice(0, 8);
  const used = new Set(must_read.map(i => i.id));
  const worth_reading = items.filter(i => !used.has(i.id) && i.total_score >= 70).slice(0, 16);
  worth_reading.forEach(i => used.add(i.id));
  const signal_watch = items.filter(i => !used.has(i.id) && i.total_score >= 55).slice(0, 20);
  return { must_read, worth_reading, signal_watch };
}

function isLiveRunCandidate(c: Candidate) {
  return c.live_fetch === true &&
    c.discovery_run_date === issueDate &&
    c.fetch_status !== 'skipped' &&
    c.source_platform !== 'manual';
}

async function run() {
  const candidates = await readJson<Candidate[]>(`data/candidates/${issueDate}.json`, []);
  const rawRun = await readJson<any>(`data/raw/${issueDate}-run.json`, {});
  const used = await readJson<any[]>('data/archive/used_items.json', []);
  const historical = used.filter(u => u.issue_date !== issueDate);
  const usedKeys = new Set(historical.flatMap(u => [u.canonical_url, u.dedupe_key, u.title_hash, u.cluster_id].filter(Boolean)));
  const blockedDuplicates: Candidate[] = [];
  const blockedNonLive: Candidate[] = [];
  const seen = new Set<string>();
  const seenCluster = new Set<string>();
  const liveRun = rawRun.live_fetch === true;

  const eligible = candidates
    .filter(c => allowed.has(c.content_type) && c.status !== 'rejected')
    .filter(c => {
      if (!liveRun || !isLiveRunCandidate(c)) {
        blockedNonLive.push(c);
        return false;
      }
      const keys = [c.canonical_url, c.dedupe_key, c.title_hash, c.cluster_id].filter(Boolean) as string[];
      const duplicate = keys.some(k => usedKeys.has(k)) || seen.has(c.canonical_url) || seen.has(c.dedupe_key) || seenCluster.has(c.cluster_id || '');
      if (duplicate) { blockedDuplicates.push(c); return false; }
      seen.add(c.canonical_url); seen.add(c.dedupe_key); if (c.cluster_id) seenCluster.add(c.cluster_id);
      return true;
    })
    .sort((a, b) => b.total_score - a.total_score);

  const { must_read, worth_reading, signal_watch } = classify(eligible);
  const selected = [...must_read, ...worth_reading, ...signal_watch].map(item => ({ ...item, status: 'selected' as const, used_in_issue: issueDate }));
  const selectedCount = selected.length;
  const isInitialSourceIndex = selectedCount === 0;
  const srcStats = await sourceStats();
  const sourceIndex = isInitialSourceIndex ? (await Promise.all(['company_sources.yaml','external_sources.yaml','media.yaml','vc_sources.yaml','research_sources.yaml'].map(f => loadYamlList(`data/sources/${f}`)))).flat().map(s => ({
    name: s.name,
    category: s.category,
    homepage_url: s.homepage_url,
    blog_url: s.blog_url,
    rss_url: s.rss_url,
    sitemap_url: s.sitemap_url,
    x_url: s.x_url,
    priority: s.priority,
    use_as: s.use_as,
    tags: s.tags || []
  })).slice(0, 80) : [];

  const issue = {
    metadata: {
      issue_date: issueDate,
      generated_at: beijingISOString(),
      timezone: 'Asia/Shanghai',
      sources_scanned: rawRun.sources_scanned || srcStats.total,
      live_sources_scanned: rawRun.live_sources_scanned || 0,
      candidates_count: candidates.length,
      selected_count: selectedCount,
      duplicates_blocked: blockedDuplicates.length,
      non_live_blocked: blockedNonLive.length,
      fetch_failures: rawRun.fetch_failures || 0,
      live_fetch: Boolean(rawRun.live_fetch),
      discovery_sources_attempted: rawRun.discovery_sources_attempted || 0,
      discovery_sources_scanned: rawRun.discovery_sources_scanned || 0,
      is_initial_source_index: isInitialSourceIndex
    },
    summary: {
      one_liner: isInitialSourceIndex
        ? '本期为初始来源索引或无合格新增 Articles：它验证来源库、合规边界与站点结构，不使用历史内容冒充新一期。'
        : `本期从 ${candidates.length} 条当日 live fetch 候选中筛出 ${selectedCount} 条未展示过的公开 Articles，默认按质量而非热度排序。`,
      main_trends: isInitialSourceIndex
        ? ['来源库已覆盖 AI 公司、应用、Infra、VC、媒体、研究机构与社区发现入口。', '没有当日 live fetch 新候选时，不回填历史展示内容。']
        : Array.from(new Set(selected.flatMap(i => i.topics))).slice(0, 6),
      what_to_watch: isInitialSourceIndex
        ? ['下一期自动运行将继续从 RSS/Atom、JSON Feed、公开 sitemap、公开博客索引中寻找新增 Articles。', 'X 仅作为发现入口；无法合规访问的内容会记录 fetch_status，而不会强抓正文。']
        : Array.from(new Set(selected.flatMap(i => i.what_to_watch_next ? [i.what_to_watch_next] : []))).slice(0, 5)
    },
    must_read: selected.filter(i => i.total_score >= 85).slice(0, 8),
    worth_reading: selected.filter(i => i.total_score >= 70 && i.total_score < 85).slice(0, 16),
    signal_watch: selected.filter(i => i.total_score >= 55 && i.total_score < 70).slice(0, 20),
    hot_rank: [...selected].sort((a, b) => (b.heat_score || 0) - (a.heat_score || 0)),
    clusters: buildClusters(selected),
    sources: rawRun.errors ? rawRun.errors.map((e: any) => e.source).slice(0, 40) : [],
    source_index: sourceIndex,
    compliance_note: 'No paid API, no X paid API, no login-wall bypass, no CAPTCHA bypass, no Cloudflare bypass, no rate-limit evasion, no full copyrighted article body storage.'
  };

  await writeJson(`data/issues/${issueDate}.json`, issue);
  await fs.mkdir('content/issues', { recursive: true });
  await fs.writeFile(`content/issues/${issueDate}.md`, `---\nissue_date: ${issueDate}\ntitle: X Articles Daily ${issueDate}\n---\n\n${issue.summary.one_liner}\n`, 'utf8');

  const newUsed = [
    ...historical,
    ...selected.map(item => ({
      item_id: item.id,
      canonical_url: item.canonical_url,
      dedupe_key: item.dedupe_key,
      title_hash: item.title_hash,
      title: item.title,
      issue_date: issueDate,
      cluster_id: item.cluster_id,
      discovery_run_date: item.discovery_run_date,
      source_platform: item.source_platform,
      used_as: item.total_score >= 85 ? 'must_read' : item.total_score >= 70 ? 'worth_reading' : 'signal_watch'
    }))
  ];
  await writeJson('data/archive/used_items.json', newUsed);
  await generateSiteData(issue);
  console.log(`Built issue ${issueDate}: ${selectedCount} selected, ${blockedDuplicates.length} duplicate candidates blocked, ${blockedNonLive.length} non-live candidates blocked.`);
}

run().catch(error => { console.error(error); process.exit(1); });
