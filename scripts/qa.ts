import { promises as fs } from 'node:fs';
import { parse } from 'yaml';
import { listFiles, loadYamlList, readJson, readText } from './utils/fs.js';
import { beijingDate } from './utils/time.js';

const errors: string[] = [];
const required = [
  'package.json','astro.config.mjs','tsconfig.json','README.md','.github/workflows/daily.yml',
  'data/sources/x_accounts.yaml','data/sources/external_sources.yaml','data/sources/media.yaml','data/sources/vc_sources.yaml','data/sources/company_sources.yaml','data/sources/research_sources.yaml','data/sources/query_templates.yaml','data/sources/manual_links.yaml','data/sources/curated_x_articles.yaml','data/sources/curated_external_articles.yaml','data/sources/blocklist.yaml','data/sources/source_policy.md',
  'data/archive/used_items.json','public/assets/wechat-qrcode.svg','public/index-data/latest.json','public/index-data/issues.json','public/index-data/search.json',
  'scripts/collect-sources.ts','scripts/fetch-public.ts','scripts/extract-links.ts','scripts/score-candidates.ts','scripts/dedupe.ts','scripts/cluster.ts','scripts/build-issue.ts','scripts/generate-site-data.ts','scripts/qa.ts',
  'src/pages/index.astro','src/pages/issues/index.astro','src/pages/issues/latest.astro','src/pages/issues/[date].astro','src/pages/sources.astro','src/pages/topics.astro','src/pages/about.astro','src/pages/search.astro','src/components/Header.astro','src/components/WechatPopover.astro','src/components/ArticleCard.astro','src/layouts/BaseLayout.astro','src/styles/global.css'
];
const allowedTypes = new Set(['x_article','external_article','company_blog_article','media_article','vc_article','research_blog_article']);

async function exists(file: string) { try { await fs.access(file); return true; } catch { return false; } }
function fail(message: string) { errors.push(message); }

for (const file of required) if (!(await exists(file))) fail(`Missing required file: ${file}`);

for (const file of ['data/sources/x_accounts.yaml','data/sources/external_sources.yaml','data/sources/media.yaml','data/sources/vc_sources.yaml','data/sources/company_sources.yaml','data/sources/research_sources.yaml','data/sources/query_templates.yaml','data/sources/blocklist.yaml']) {
  try { parse(await readText(file)); } catch (e: any) { fail(`Invalid YAML ${file}: ${e.message}`); }
}

const latest = await readJson<any>('public/index-data/latest.json', null);
if (!latest?.metadata?.issue_date) fail('latest.json missing metadata.issue_date');
const issueDate = latest?.metadata?.issue_date || beijingDate();
const issueFile = `data/issues/${issueDate}.json`;
if (!(await exists(issueFile))) fail(`Latest issue does not exist: ${issueFile}`);
const issue = await readJson<any>(issueFile, {});
const candidates = await readJson<any[]>(`data/candidates/${issueDate}.json`, []);
const selected = [...(issue.must_read || []), ...(issue.worth_reading || []), ...(issue.signal_watch || [])];
if ((issue.metadata?.selected_count || 0) !== selected.length) fail('selected_count does not match selected arrays length');

const urls = new Set<string>();
const keys = new Set<string>();
const clusters = new Set<string>();
for (const item of selected) {
  for (const field of ['title','canonical_url','summary','reason_selected','total_score','dedupe_key','source_type']) {
    if (item[field] === undefined || item[field] === null || item[field] === '') fail(`Selected item missing ${field}: ${item.title || item.id}`);
  }
  if (!allowedTypes.has(item.content_type)) fail(`Forbidden selected content_type: ${item.content_type}`);
  if (/thread|podcast|paper_record|github_repo|short_post|product_landing/i.test(String(item.content_type))) fail(`Forbidden primary content type surfaced: ${item.content_type}`);
  if (urls.has(item.canonical_url)) fail(`Duplicate selected URL: ${item.canonical_url}`);
  urls.add(item.canonical_url);
  if (keys.has(item.dedupe_key)) fail(`Duplicate selected dedupe_key: ${item.dedupe_key}`);
  keys.add(item.dedupe_key);
  if (item.cluster_id) {
    if (clusters.has(item.cluster_id)) fail(`Duplicate selected cluster: ${item.cluster_id}`);
    clusters.add(item.cluster_id);
  }
  if (item.fetch_status === 'failed' && !item.fetch_error) fail(`Failed fetch without fetch_error: ${item.title}`);
}

const used = await readJson<any[]>('data/archive/used_items.json', []);
const historical = used.filter(u => u.issue_date !== issueDate);
for (const item of selected) {
  if (historical.some(u => u.canonical_url === item.canonical_url || u.dedupe_key === item.dedupe_key || u.title_hash === item.title_hash || u.cluster_id === item.cluster_id)) {
    fail(`Selected item repeats historical used item: ${item.title}`);
  }
}

const issues = await readJson<any[]>('public/index-data/issues.json', []);
const search = await readJson<any[]>('public/index-data/search.json', []);
if (!Array.isArray(issues)) fail('issues index is not array');
if (!Array.isArray(search)) fail('search index is not array');

const sourcesCount = (await Promise.all(['company_sources.yaml','external_sources.yaml','media.yaml','vc_sources.yaml','research_sources.yaml','x_accounts.yaml'].map(f => loadYamlList(`data/sources/${f}`)))).flat().length;
if (sourcesCount < 70) fail(`Sources library too small: ${sourcesCount}`);

const dailyWorkflow = await readText('.github/workflows/daily.yml');
if (!dailyWorkflow.includes('12 22 * * *')) fail('GitHub Actions cron must be 12 22 * * *');
if (!dailyWorkflow.includes('contents: write')) fail('GitHub Actions permissions.contents must be write');

const readme = await readText('README.md');
for (const phrase of ['不使用付费 API','X paid API','合规边界','去重规则','公众号二维码']) {
  if (!readme.includes(phrase)) fail(`README missing phrase: ${phrase}`);
}

const header = await readText('src/components/Header.astro');
const popover = await readText('src/components/WechatPopover.astro');
const globalCss = await readText('src/styles/global.css');
if (!popover.includes('/assets/wechat-qrcode.svg')) fail('WechatPopover must reference /assets/wechat-qrcode.svg');
if (/base64/i.test(header + popover)) fail('Header/WechatPopover must not contain base64');
if (!popover.includes('hidden') || !popover.includes('click')) fail('WechatPopover must default hidden and toggle on click');
if (!(popover + globalCss).includes('86vw') || !(popover + globalCss).includes('translateX(-50%)')) fail('Mobile WeChat popover must be centered and width-limited');

const srcFiles = await listFiles('src/pages', '.astro');
const allSrc = (await Promise.all([...srcFiles, 'src/components/Header.astro','src/components/WechatPopover.astro','src/components/ArticleCard.astro','src/layouts/BaseLayout.astro','src/styles/global.css'].map(f => readText(f)))).join('\n');
for (const bad of ['lorem ipsum','undefined','NaN']) {
  if (allSrc.toLowerCase().includes(bad.toLowerCase())) fail(`Display source contains forbidden placeholder: ${bad}`);
}

const issueFiles = await listFiles('data/issues', '.json');
for (const file of issueFiles) {
  const text = await readText(file);
  if (/mock\s+(article|author|news)/i.test(text)) fail(`Mock content marker in ${file}`);
}

if (errors.length) {
  console.error('QA failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`QA passed: ${required.length} files, ${sourcesCount} sources, ${selected.length} selected Articles, latest ${issueDate}.`);
