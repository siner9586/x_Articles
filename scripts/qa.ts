import { promises as fs } from 'node:fs';
import { parse } from 'yaml';
import { listFiles, loadYamlList, readJson, readText } from './utils/fs.js';
import { beijingDate } from './utils/time.js';
import { buildShownIndex, duplicateReason, selectedItems } from './history-index.js';
import { attachArticleIdentity, isForbiddenPrimaryUrl, isXArticleUrl, xArticleVerdict } from './x-article.js';

const errors: string[] = [];
const required = [
  'package.json','astro.config.mjs','tsconfig.json','README.md','.github/workflows/daily.yml',
  'data/sources/x_accounts.yaml','data/sources/external_sources.yaml','data/sources/media.yaml','data/sources/vc_sources.yaml','data/sources/company_sources.yaml','data/sources/research_sources.yaml','data/sources/query_templates.yaml','data/sources/x_article_search_queries.yaml','data/sources/manual_links.yaml','data/sources/curated_x_articles.yaml','data/sources/curated_external_articles.yaml','data/sources/blocklist.yaml','data/sources/source_policy.md',
  'data/archive/used_items.json','public/assets/wechat-qrcode.svg','public/index-data/latest.json','public/index-data/issues.json','public/index-data/search.json',
  'scripts/collect-sources.ts','scripts/fetch-public.ts','scripts/extract-links.ts','scripts/score-candidates.ts','scripts/dedupe.ts','scripts/cluster.ts','scripts/build-issue.ts','scripts/generate-site-data.ts','scripts/preflight.ts','scripts/daily.ts','scripts/x-article.ts','scripts/history-index.ts','scripts/qa.ts','scripts/test.ts',
  'scripts/x-backends/types.ts','scripts/x-backends/utils.ts','scripts/x-backends/static-http.ts','scripts/x-backends/browser-render.ts','scripts/x-backends/discovery-search.ts','scripts/x-backends/nitter-public.ts','scripts/x-backends/curated-live.ts','scripts/x-backends/fxtwitter.ts','scripts/x-backends/index.ts',
  'src/pages/index.astro','src/pages/issues/index.astro','src/pages/issues/latest.astro','src/pages/issues/[date].astro','src/pages/sources.astro','src/pages/topics.astro','src/pages/about.astro','src/pages/search.astro','src/components/Header.astro','src/components/WechatPopover.astro','src/components/ArticleCard.astro','src/layouts/BaseLayout.astro','src/styles/global.css'
];
const expectedCrons = [
  '12 22 * * *','22 22 * * *','32 22 * * *','42 22 * * *','52 22 * * *',
  '2 23 * * *','12 23 * * *','22 23 * * *','32 23 * * *','42 23 * * *','52 23 * * *',
  '2 0 * * *','12 0 * * *','22 0 * * *','32 0 * * *','42 0 * * *','52 0 * * *',
  '2 1 * * *','12 1 * * *','22 1 * * *','32 1 * * *','42 1 * * *','52 1 * * *',
  '2 2 * * *','12 2 * * *','22 2 * * *','32 2 * * *','42 2 * * *','52 2 * * *',
  '2 3 * * *'
];

async function exists(file: string) { try { await fs.access(file); return true; } catch { return false; } }
function fail(message: string) { errors.push(message); }
function selectedPath(issueDate: string, index: number) { return `data/issues/${issueDate}.json selected[${index}]`; }

for (const file of required) if (!(await exists(file))) fail(`Missing required file: ${file}`);

for (const file of ['data/sources/x_accounts.yaml','data/sources/external_sources.yaml','data/sources/media.yaml','data/sources/vc_sources.yaml','data/sources/company_sources.yaml','data/sources/research_sources.yaml','data/sources/query_templates.yaml','data/sources/x_article_search_queries.yaml','data/sources/blocklist.yaml']) {
  try { parse(await readText(file)); } catch (e: any) { fail(`Invalid YAML ${file}: ${e.message}`); }
}
for (const file of ['data/sources/external_sources.yaml','data/sources/media.yaml','data/sources/vc_sources.yaml','data/sources/company_sources.yaml','data/sources/research_sources.yaml']) {
  const text = await readText(file);
  if (/use_as:\s*primary_article_source/.test(text)) fail(`${file} must not mark external sources as primary_article_source`);
}

const pkg = JSON.parse(await readText('package.json', '{}'));
if (!pkg.devDependencies?.playwright) fail('package.json must include Playwright for browser_render backend');

const workflow = await readText('.github/workflows/daily.yml');
const pagesWorkflow = await readText('.github/workflows/pages.yml');
const cronMatches = [...workflow.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
if (cronMatches.length !== 30) fail(`GitHub Actions daily workflow must have 30 schedule trigger points, found ${cronMatches.length}`);
for (const cron of expectedCrons) if (!cronMatches.includes(cron)) fail(`Missing expected UTC cron: ${cron}`);
for (const phrase of [
  'workflow_dispatch:',
  'permissions:',
  'contents: write',
  'force:',
  'concurrency:',
  'cancel-in-progress: false',
  'Resolve Beijing publish_date',
  'attempt_index',
  'final_compensation',
  'X_ARTICLES_FETCH_LIVE',
  'X_ARTICLES_BROWSER_FETCH',
  'X_ARTICLES_FETCH_BACKENDS',
  'nitter_public',
  'NITTER_URL',
  'Install Playwright browsers',
  'npm ci',
  'npm run daily'
]) {
  if (!workflow.includes(phrase)) fail(`daily workflow missing phrase: ${phrase}`);
}
if (!workflow.includes('git add data content public/index-data')) fail('daily workflow must commit data, content and public/index-data');
if (!pagesWorkflow.includes('workflow_dispatch:')) fail('pages workflow must keep manual dispatch available');
if (/\n\s*push:\s*\n/.test(pagesWorkflow)) fail('pages workflow should not auto-run on push when Cloudflare Pages is the primary deployment');

const collect = await readText('scripts/collect-sources.ts');
for (const phrase of ['runBackends','browser_render','discovery_search','nitter_public','curated_live','fxtwitter','history_fallback_used: false','mock_used: false']) {
  if (!collect.includes(phrase)) fail(`collect-sources missing phrase: ${phrase}`);
}
const browserRender = await readText('scripts/x-backends/browser-render.ts');
const gitignore = await readText('.gitignore');
if (!browserRender.includes('X_ARTICLES_DEBUG_SNAPSHOTS')) fail('browser_render snapshots must be gated by X_ARTICLES_DEBUG_SNAPSHOTS');
if (!gitignore.includes('data/raw/browser-snapshots/')) fail('.gitignore must ignore browser snapshots');
for (const forbidden of ['external_sources.yaml','company_sources.yaml','media.yaml','vc_sources.yaml','research_sources.yaml']) {
  if (collect.includes(forbidden)) fail(`collect-sources must not read ${forbidden} for selected candidates`);
}

const buildIssue = await readText('scripts/build-issue.ts');
for (const phrase of ['finalCompensation','deferred_until_later_compensation','empty_issue_generated_final_compensation','No historical content was reused.']) {
  if (!buildIssue.includes(phrase)) fail(`build-issue missing final compensation phrase: ${phrase}`);
}
const scoreScript = await readText('scripts/score-candidates.ts');
if (!scoreScript.includes('heat * 0.10')) fail('score-candidates must keep heat weight at about 10%');
const dailyScript = await readText('scripts/daily.ts');
for (const phrase of ["['run', 'collect']", "['run', 'score']", "['run', 'build:issue']", "['run', 'qa']", "['run', 'build']"]) {
  if (!dailyScript.includes(phrase)) fail(`daily.ts must orchestrate npm run chain step: ${phrase}`);
}

const latest = await readJson<any>('public/index-data/latest.json', null);
if (!latest?.metadata?.issue_date) fail('latest.json missing metadata.issue_date');
if ((latest?.metadata?.selected_count || 0) === 0 && !latest?.metadata?.empty_reason) fail('latest.json empty issue must have metadata.empty_reason');
const issuesIndex = await readJson<any[]>('public/index-data/issues.json', []);
const search = await readJson<any[]>('public/index-data/search.json', []);
if (!Array.isArray(issuesIndex)) fail('issues index is not array');
if (!Array.isArray(search)) fail('search index is not array');
if (search.some(item => !isXArticleUrl(item?.url || ''))) fail('search index contains non-X Article URL');
if (latest?.metadata?.issue_date) {
  const latestIssueFile = `data/issues/${latest.metadata.issue_date}.json`;
  if (!(await exists(latestIssueFile))) fail(`latest.json points to missing issue file: ${latestIssueFile}`);
  if (!issuesIndex.some(item => item.issue_date === latest.metadata.issue_date)) fail('issues.json does not contain latest.json issue_date');
}

const issueFiles = await listFiles('data/issues', '.json');
const maxIssueDate = issueFiles.map(file => file.replace(/^.*\/|\.json$/g, '')).sort().at(-1);
if (maxIssueDate && latest?.metadata?.issue_date !== maxIssueDate) fail(`latest.json issue_date ${latest?.metadata?.issue_date} is not latest issue ${maxIssueDate}`);
const forbiddenContentTypes = new Set(['external_article', 'company_blog_article', 'media_article', 'vc_article', 'research_blog_article']);
for (const file of issueFiles) {
  const issue = await readJson<any>(file, {});
  const issueDate = issue?.metadata?.issue_date || file.replace(/^.*\/|\.json$/g, '');
  const selected = selectedItems(issue);
  if ((issue.metadata?.selected_count || 0) !== selected.length) fail(`${file} selected_count does not match selected arrays length`);
  if ((issue.metadata?.selected_count || 0) === 0 && !issue.metadata?.empty_reason) fail(`${file} empty issue must have metadata.empty_reason`);
  if (issue?.source_index?.length) fail(`${file} contains source_index display data; production issues must contain current X Articles only`);
  selected.forEach((raw, index) => {
    const item = attachArticleIdentity(raw);
    const label = selectedPath(issueDate, index);
    const verdict = xArticleVerdict(item);
    if (!verdict.ok) fail(`${label} is not a strict X Article: ${verdict.reason} ${item.canonical_url || ''}`);
    if (isForbiddenPrimaryUrl(item.canonical_url)) fail(`${label} has forbidden primary URL: ${item.canonical_url}`);
    for (const field of ['title','author','canonical_url','article_url','source_type','fetched_at','fetch_batch_id','source_platform','content_type','content_hash','url_hash','reason_for_selection','backend']) {
      if (item[field] === undefined || item[field] === null || item[field] === '') fail(`${label} missing ${field}`);
    }
    if (item.source_type !== 'x_article' || item.content_type !== 'x_article' || item.source_platform !== 'x') fail(`${label} must be source_type/content_type x_article and source_platform x`);
    if (forbiddenContentTypes.has(item.content_type) || forbiddenContentTypes.has(item.source_type)) fail(`${label} contains forbidden content/source type`);
    if (item.live_fetch !== true) fail(`${label} is not from live fetch`);
    if (item.discovery_run_date !== issueDate) fail(`${label} discovery_run_date mismatch`);
    if (item.fetch_status === 'skipped') fail(`${label} has fetch_status skipped`);
    if (/\/status(?:es)?\//i.test(item.canonical_url || item.article_url || '')) fail(`${label} contains ordinary status URL`);
    if (/thread|podcast|youtube|newsletter|substack|external_article|company_blog_article|media_article|vc_article|research_blog_article|short_post|status/i.test(`${item.content_type} ${item.source_type} ${item.canonical_url}`)) fail(`${label} looks like forbidden non-Article content`);
  });

  const currentHistory = (await buildShownIndex(issueDate));
  for (const raw of selected) {
    const reason = duplicateReason(raw, currentHistory);
    if (reason) fail(`${file} reuses historical shown content: ${raw.title || raw.canonical_url} (${reason})`);
  }
}

const shownIndex = await readJson<any[]>('data/state/shown-index.json', []);
const rebuilt = await buildShownIndex('');
if (!Array.isArray(shownIndex)) fail('data/state/shown-index.json is not array');
if (shownIndex.length !== rebuilt.length) fail(`shown-index length ${shownIndex.length} does not match rebuilt ${rebuilt.length}`);
for (const entry of shownIndex) {
  for (const field of ['canonical_url','normalized_url','article_id','url_hash','content_hash','title_hash','author_title_hash','near_title_hash','near_content_hash','shown_date','source_file']) {
    if (!entry[field]) fail(`shown-index entry missing ${field}: ${entry.title || entry.canonical_url}`);
  }
}

const currentDate = beijingDate();
const currentCandidates = await readJson<any[]>(`data/candidates/${currentDate}.json`, []);
for (const item of currentCandidates) {
  const verdict = xArticleVerdict(item);
  if (!verdict.ok) fail(`Current candidate is not X Article: ${verdict.reason} ${item.canonical_url || item.title || item.id}`);
  if (item.live_fetch !== true || item.discovery_run_date !== currentDate) fail(`Current candidate lacks current live fetch evidence: ${item.title || item.canonical_url}`);
}

const currentRaw = await readJson<any>(`data/raw/${currentDate}-run.json`, null);
if (currentRaw) {
  if (currentRaw.live_fetch !== true) fail('Current raw run must be live_fetch=true in production data');
  if (currentRaw.history_fallback_used === true) fail('Current raw run used historical fallback');
  if (currentRaw.mock_used === true) fail('Current raw run used mock data');
  if (currentRaw.selected_count === 0 && currentRaw.empty_issue_generated === true && currentRaw.final_compensation !== true) fail('Empty issue can only be generated on final compensation');
}

const readme = await readText('README.md');
for (const phrase of ['不使用付费 API','X paid API','合规边界','去重规则','公众号二维码','06:12','只收录 X Articles','selected 主卡片只允许 x_article','shown-index.json','30 次','多后端','Playwright','Nitter','第 30 次']) {
  if (!readme.includes(phrase)) fail(`README missing phrase: ${phrase}`);
}
if (!readme.includes('Cloudflare Pages')) fail('README must document Cloudflare Pages as primary static deployment');

const header = await readText('src/components/Header.astro');
const issueView = await readText('src/components/IssueView.astro');
const popover = await readText('src/components/WechatPopover.astro');
const globalCss = await readText('src/styles/global.css');
if (/06:12|BJT/.test(header)) fail('Header must not show 06:12/BJT time label');
if (/BJT first run/.test(issueView)) fail('Issue view must not restore the deleted BJT first-run copy');
if (!issueView.includes('无合格新增 X Articles')) fail('Issue view must clearly show 无合格新增 X Articles for empty issues');
if (!popover.includes('/assets/wechat-qrcode.svg')) fail('WechatPopover must reference /assets/wechat-qrcode.svg');
if (!popover.includes('公众号：灵感与观点交流')) fail('WechatPopover trigger must include 公众号：灵感与观点交流');
if (/base64/i.test(header + popover)) fail('Header/WechatPopover must not contain base64');
if (!popover.includes('hidden') || !popover.includes('click')) fail('WechatPopover must default hidden and toggle on click');
if (!(popover + globalCss).includes('86vw') || !(popover + globalCss).includes('translateX(-50%)')) fail('Mobile WeChat popover must be centered and width-limited');

const sourcesCount = (await loadYamlList('data/sources/x_accounts.yaml')).length;
if (sourcesCount < 300) fail(`X account source library too small: ${sourcesCount}`);
const xAccounts = await loadYamlList('data/sources/x_accounts.yaml');
const xAccountRequired = ['handle','display_name','category','organization','role','homepage_url','x_url','priority','language','notes','tags','verify_status'];
const seenHandles = new Set<string>();
for (const [index, account] of xAccounts.entries()) {
  for (const field of xAccountRequired) {
    if (!(field in account)) fail(`x_accounts[${index}] missing ${field}`);
  }
  const handle = String(account.handle || '').trim();
  if (!handle) fail(`x_accounts[${index}] missing handle`);
  if (/^TODO/i.test(handle) || /TODO/i.test(`${account.display_name || ''} ${account.organization || ''} ${account.role || ''}`)) fail(`x_accounts[${index}] contains TODO placeholder`);
  if (!/^https:\/\/x\.com\/[A-Za-z0-9_]+\/?$/.test(String(account.x_url || ''))) fail(`x_accounts[${index}] invalid x_url: ${account.x_url}`);
  const key = handle.toLowerCase();
  if (seenHandles.has(key)) fail(`duplicate x account handle: ${handle}`);
  seenHandles.add(key);
  if (!Array.isArray(account.tags)) fail(`x_accounts[${index}] tags must be array`);
}
const searchQueryCount = (await loadYamlList('data/sources/x_article_search_queries.yaml')).length;
if (searchQueryCount < 10) fail(`X Article search query library too small: ${searchQueryCount}`);

const srcFiles = await listFiles('src/pages', '.astro');
const allSrc = (await Promise.all([...srcFiles, 'src/components/Header.astro','src/components/WechatPopover.astro','src/components/ArticleCard.astro','src/layouts/BaseLayout.astro','src/styles/global.css'].map(f => readText(f)))).join('\n');
for (const bad of ['lorem ipsum','undefined','NaN']) {
  if (allSrc.toLowerCase().includes(bad.toLowerCase())) fail(`Display source contains forbidden placeholder: ${bad}`);
}

for (const file of issueFiles) {
  const issue = await readJson<any>(file, {});
  if (issue?.metadata?.history_fallback_used === true) fail(`Historical fallback used in ${file}`);
  if (issue?.metadata?.mock_used === true) fail(`Mock data used in ${file}`);
}

if (errors.length) {
  console.error('QA failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`QA passed: ${required.length} files, ${sourcesCount} X account sources, ${searchQueryCount} X Article search queries, ${issueFiles.length} issue files, ${shownIndex.length} shown-index entries, ${cronMatches.length} scheduled trigger points.`);
