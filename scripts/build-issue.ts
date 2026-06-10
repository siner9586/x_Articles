import { promises as fs } from 'node:fs';
import { buildClusters } from './cluster.js';
import { loadYamlList, readJson, writeJson } from './utils/fs.js';
import { beijingDate, beijingISOString } from './utils/time.js';
import { generateSiteData } from './generate-site-data.js';
import type { Candidate } from './utils/types.js';

const issueDate = process.env.ISSUE_DATE || beijingDate();
const allowed = new Set(['x_article']);

async function sourceStats() {
  const sourceFiles = ['x_accounts.yaml'];
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
  return c.content_type === 'x_article' &&
    c.live_fetch === true &&
    c.discovery_run_date === issueDate &&
    c.fetch_status !== 'skipped' &&
    c.source_platform === 'x' &&
    /^https:\/\/(x\.com|twitter\.com)\//i.test(c.canonical_url || '');
}

async function run() {
  const candidates = await readJson<Candidate[]>(`data/candidates/${issueDate}.json`, []);
  const rawRun = await readJson<any>(`data/raw/${issueDate}-run.json`, {});
  const used = await readJson<any[]>('data/archive/used_items.json', []);
  const historical = used.filter(u => u.issue_date !== issueDate);
  const usedKeys = new Set(historical.flatMap(u => [u.canonical_url, u.dedupe_key, u.title_hash, u.cluster_id].filter(Boolean)));
  const blockedDuplicates: Candidate[] = [];
  const blockedNonX: Candidate[] = [];
  const blockedNonLive: Candidate[] = [];
  const seen = new Set<string>();
  const seenCluster = new Set<string>();
  const liveRun = rawRun.live_fetch === true;

  const eligible = candidates
    .filter(c => {
      const ok = allowed.has(c.content_type) && /^https:\/\/(x\.com|twitter\.com)\//i.test(c.canonical_url || '');
      if (!ok) blockedNonX.push(c);
      return ok;
    })
    .filter(c => c.status !== 'rejected')
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
  const sourceIndex = isInitialSourceIndex ? (await loadYamlList('data/sources/x_accounts.yaml')).map(s => ({
    name: s.display_name || s.name || s.handle,
    handle: s.handle,
    category: s.category,
    homepage_url: s.homepage_url,
    x_url: s.x_url,
    priority: s.priority,
    tags: s.tags || [],
    use_as: 'x_article_discovery_only'
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
      non_x_blocked: blockedNonX.length,
      non_live_blocked: blockedNonLive.length,
      fetch_failures: rawRun.fetch_failures || 0,
      live_fetch: Boolean(rawRun.live_fetch),
      discovery_sources_attempted: rawRun.discovery_sources_attempted || 0,
      discovery_sources_scanned: rawRun.discovery_sources_scanned || 0,
      is_initial_source_index: isInitialSourceIndex,
      selected_policy: 'x_article_only'
    },
    summary: {
      one_liner: isInitialSourceIndex
        ? '本期没有合格新增 X Articles：系统不使用外部官网长文、普通短帖、thread 或历史内容冒充新一期。'
        : `本期从 ${candidates.length} 条当日候选中筛出 ${selectedCount} 条未展示过的公开 X Articles，默认按质量而非热度排序。`,
      main_trends: isInitialSourceIndex
        ? ['主内容只允许 X Articles。', '外部官网文章、媒体文章、博客文章、论文、GitHub、播客和普通 X 短帖只能作为 evidence/background，不能进入 selected。']
        : Array.from(new Set(selected.flatMap(i => i.topics))).slice(0, 6),
      what_to_watch: isInitialSourceIndex
        ? ['下一期将继续检查公开 X Article 链接；无法合规验证为 X Article 的内容不会进入主卡片。']
        : Array.from(new Set(selected.flatMap(i => i.what_to_watch_next ? [i.what_to_watch_next] : []))).slice(0, 5)
    },
    must_read: selected.filter(i => i.total_score >= 85).slice(0, 8),
    worth_reading: selected.filter(i => i.total_score >= 70 && i.total_score < 85).slice(0, 16),
    signal_watch: selected.filter(i => i.total_score >= 55 && i.total_score < 70).slice(0, 20),
    hot_rank: [...selected].sort((a, b) => (b.heat_score || 0) - (a.heat_score || 0)),
    clusters: buildClusters(selected),
    sources: rawRun.errors ? rawRun.errors.map((e: any) => e.source).slice(0, 40) : [],
    source_index: sourceIndex,
    compliance_note: 'Selected primary content is X Articles only. No paid API, no X paid API, no login-wall bypass, no CAPTCHA bypass, no Cloudflare bypass, no rate-limit evasion, no full copyrighted article body storage.'
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
      content_type: item.content_type,
      used_as: item.total_score >= 85 ? 'must_read' : item.total_score >= 70 ? 'worth_reading' : 'signal_watch'
    }))
  ];
  await writeJson('data/archive/used_items.json', newUsed);
  await generateSiteData(issue);
  console.log(`Built X-only issue ${issueDate}: ${selectedCount} selected, ${blockedDuplicates.length} duplicate candidates blocked, ${blockedNonX.length} non-X candidates blocked, ${blockedNonLive.length} non-live candidates blocked.`);
}

run().catch(error => { console.error(error); process.exit(1); });
