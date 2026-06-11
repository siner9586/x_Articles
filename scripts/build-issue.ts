import { promises as fs } from 'node:fs';
import { buildClusters } from './cluster.js';
import { loadYamlList, readJson, writeJson } from './utils/fs.js';
import { beijingDate, beijingISOString } from './utils/time.js';
import { generateSiteData } from './generate-site-data.js';
import type { Candidate } from './utils/types.js';
import { appendRunLog, duplicateReason, rebuildShownIndex, writeLatestSuccess, writeUsedItemsCompat } from './history-index.js';
import { attachArticleIdentity, isForbiddenPrimaryUrl, xArticleVerdict } from './x-article.js';

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
  const verdict = xArticleVerdict(c);
  return verdict.ok &&
    c.content_type === 'x_article' &&
    c.live_fetch === true &&
    c.discovery_run_date === issueDate &&
    c.fetch_status !== 'skipped' &&
    c.source_platform === 'x' &&
    c.source_type === 'x_article';
}

function selectedShape(item: Candidate): Candidate {
  const c = attachArticleIdentity(item);
  const authorHandle = (c.author_handle || '').replace(/^@/, '');
  const summary = c.summary || c.excerpt || '';
  return {
    ...c,
    article_url: c.canonical_url,
    author_url: authorHandle ? `https://x.com/${authorHandle}` : undefined,
    discovered_at: c.captured_at,
    fetched_at: c.fetched_at || c.captured_at,
    fetch_batch_id: c.fetch_batch_id || c.run_id || '',
    run_id: c.run_id || c.fetch_batch_id || '',
    source_type: 'x_article',
    heat_metrics: c.heat_metrics || c.engagement || {},
    score: c.score || c.total_score,
    summary_zh: c.summary_zh || summary,
    summary_en: c.summary_en || summary,
    reason_for_selection: c.reason_for_selection || c.reason_selected || c.why_it_matters || '',
    status: 'selected' as const,
    used_in_issue: issueDate
  };
}

async function run() {
  const candidates = (await readJson<Candidate[]>(`data/candidates/${issueDate}.json`, [])).map(c => attachArticleIdentity(c));
  const rawRun = await readJson<any>(`data/raw/${issueDate}-run.json`, {});
  const historical = await rebuildShownIndex(issueDate);
  const blockedDuplicates: Candidate[] = [];
  const blockedNonX: Candidate[] = [];
  const blockedNonLive: Candidate[] = [];
  const blockedForbidden: Candidate[] = [];
  const seen = new Set<string>();
  const seenCluster = new Set<string>();
  const liveRun = rawRun.live_fetch === true;

  const eligible = candidates
    .filter(c => {
      const verdict = xArticleVerdict(c);
      const ok = allowed.has(c.content_type) && verdict.ok;
      if (!ok) blockedNonX.push(c);
      return ok;
    })
    .filter(c => c.status !== 'rejected')
    .filter(c => {
      if (isForbiddenPrimaryUrl(c.canonical_url)) {
        blockedForbidden.push(c);
        return false;
      }
      return true;
    })
    .filter(c => {
      if (!liveRun || !isLiveRunCandidate(c)) {
        blockedNonLive.push(c);
        return false;
      }
      const reason = duplicateReason(c, historical);
      const duplicate = Boolean(reason) ||
        seen.has(c.normalized_url || c.canonical_url) ||
        seen.has(c.article_id || '') ||
        seen.has(c.url_hash || '') ||
        seen.has(c.content_hash || '') ||
        seen.has(c.dedupe_key) ||
        seenCluster.has(c.cluster_id || '');
      if (duplicate) { blockedDuplicates.push(c); return false; }
      seen.add(c.normalized_url || c.canonical_url);
      if (c.article_id) seen.add(c.article_id);
      if (c.url_hash) seen.add(c.url_hash);
      if (c.content_hash) seen.add(c.content_hash);
      seen.add(c.dedupe_key);
      if (c.cluster_id) seenCluster.add(c.cluster_id);
      return true;
    })
    .sort((a, b) => b.total_score - a.total_score);

  const { must_read, worth_reading, signal_watch } = classify(eligible);
  const selected = [...must_read, ...worth_reading, ...signal_watch].map(selectedShape);
  const selectedCount = selected.length;
  const srcStats = await sourceStats();

  if (selectedCount === 0) {
    await appendRunLog({
      phase: 'generate',
      publish_date: issueDate,
      status: 'skipped_no_new_articles',
      message: '当日 live fetch 无合格新 Article，未使用历史内容补齐',
      candidates_count: candidates.length,
      duplicate_candidates_blocked: blockedDuplicates.length,
      non_x_blocked: blockedNonX.length,
      non_live_blocked: blockedNonLive.length,
      forbidden_blocked: blockedForbidden.length,
      live_fetch: Boolean(rawRun.live_fetch),
      history_entries_used_for_dedupe_only: historical.length
    });
    await writeJson(`data/raw/${issueDate}-run.json`, {
      ...rawRun,
      generation_status: 'skipped_no_new_articles',
      generation_message: '当日 live fetch 无合格新 Article，未使用历史内容补齐',
      history_entries_used_for_dedupe_only: historical.length,
      duplicate_candidates_blocked: blockedDuplicates.length,
      non_x_blocked: blockedNonX.length,
      non_live_blocked: blockedNonLive.length,
      forbidden_blocked: blockedForbidden.length
    });
    console.log(`Skipped issue ${issueDate}: 当日 live fetch 无合格新 Article，未使用历史内容补齐.`);
    return;
  }

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
      forbidden_blocked: blockedForbidden.length,
      fetch_failures: rawRun.fetch_failures || 0,
      live_fetch: Boolean(rawRun.live_fetch),
      fetch_batch_id: rawRun.fetch_batch_id || '',
      discovery_sources_attempted: rawRun.discovery_sources_attempted || 0,
      discovery_sources_scanned: rawRun.discovery_sources_scanned || 0,
      history_entries_used_for_dedupe_only: historical.length,
      is_initial_source_index: false,
      selected_policy: 'x_article_only'
    },
    summary: {
      one_liner: `本期从 ${candidates.length} 条当日 live fetch X Article 候选中筛出 ${selectedCount} 条未展示过的新 Article。`,
      main_trends: Array.from(new Set(selected.flatMap(i => i.topics))).slice(0, 6),
      what_to_watch: Array.from(new Set(selected.flatMap(i => i.what_to_watch_next ? [i.what_to_watch_next] : []))).slice(0, 5)
    },
    must_read: selected.filter(i => i.total_score >= 85).slice(0, 8),
    worth_reading: selected.filter(i => i.total_score >= 70 && i.total_score < 85).slice(0, 16),
    signal_watch: selected.filter(i => i.total_score >= 55 && i.total_score < 70).slice(0, 20),
    hot_rank: [...selected].sort((a, b) => (b.heat_score || 0) - (a.heat_score || 0)),
    clusters: buildClusters(selected),
    sources: rawRun.errors ? rawRun.errors.map((e: any) => e.source).slice(0, 40) : [],
    compliance_note: 'Selected primary content is X Articles only. No paid API, no X paid API, no login-wall bypass, no CAPTCHA bypass, no Cloudflare bypass, no rate-limit evasion, no full copyrighted article body storage.'
  };

  await writeJson(`data/issues/${issueDate}.json`, issue);
  await fs.mkdir('content/issues', { recursive: true });
  await fs.writeFile(`content/issues/${issueDate}.md`, `---\nissue_date: ${issueDate}\ntitle: X Articles Daily ${issueDate}\n---\n\n${issue.summary.one_liner}\n`, 'utf8');

  const newIndex = await rebuildShownIndex('');
  await writeUsedItemsCompat(newIndex);
  await writeLatestSuccess(issue);
  await appendRunLog({
    phase: 'generate',
    publish_date: issueDate,
    status: 'generated',
    selected_count: selectedCount,
    candidates_count: candidates.length,
    duplicate_candidates_blocked: blockedDuplicates.length,
    non_x_blocked: blockedNonX.length,
    non_live_blocked: blockedNonLive.length,
    forbidden_blocked: blockedForbidden.length,
    live_fetch: Boolean(rawRun.live_fetch),
    history_entries_used_for_dedupe_only: historical.length
  });
  await generateSiteData(issue);
  console.log(`Built X-only issue ${issueDate}: ${selectedCount} selected, ${blockedDuplicates.length} duplicate candidates blocked, ${blockedNonX.length} non-X candidates blocked, ${blockedNonLive.length} non-live candidates blocked, ${blockedForbidden.length} forbidden candidates blocked.`);
}

run().catch(error => { console.error(error); process.exit(1); });
