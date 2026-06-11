import { beijingDate } from './utils/time.js';
import { readJson } from './utils/fs.js';
import { promises as fs } from 'node:fs';

export type PreflightResult = {
  publish_date: string;
  exists: boolean;
  evidence: string[];
  force: boolean;
  should_skip: boolean;
};

export async function currentIssueExists(publishDate: string): Promise<{ exists: boolean; evidence: string[] }> {
  const evidence: string[] = [];
  const issue = await readJson<any>(`data/issues/${publishDate}.json`, null);
  if (issue?.metadata?.issue_date === publishDate) evidence.push(`data/issues/${publishDate}.json`);
  try {
    await fs.access(`content/issues/${publishDate}.md`);
    evidence.push(`content/issues/${publishDate}.md`);
  } catch {}
  const latest = await readJson<any>('public/index-data/latest.json', null);
  if (latest?.metadata?.issue_date === publishDate) evidence.push('public/index-data/latest.json');
  const issues = await readJson<any[]>('public/index-data/issues.json', []);
  if (Array.isArray(issues) && issues.some(issue => issue?.issue_date === publishDate)) evidence.push('public/index-data/issues.json');
  const shown = await readJson<any[]>('data/state/shown-index.json', []);
  if (Array.isArray(shown) && shown.some(entry => entry?.shown_date === publishDate)) evidence.push('data/state/shown-index.json');
  const latestSuccess = await readJson<any>('data/state/latest-success.json', null);
  if (latestSuccess?.publish_date === publishDate) evidence.push('data/state/latest-success.json');
  return { exists: evidence.length > 0, evidence };
}

export async function resolvePreflight(force = false, publishDate = process.env.ISSUE_DATE || beijingDate()): Promise<PreflightResult> {
  const current = await currentIssueExists(publishDate);
  return {
    publish_date: publishDate,
    exists: current.exists,
    evidence: current.evidence,
    force,
    should_skip: current.exists && !force
  };
}

async function main() {
  const force = process.argv.includes('--force') || process.env.X_ARTICLES_FORCE === 'true';
  const result = await resolvePreflight(force);
  console.log(`Resolve Beijing publish_date: ${result.publish_date}`);
  if (result.exists) console.log(`Preflight evidence for existing current issue: ${result.evidence.join(', ')}`);
  if (result.should_skip) {
    console.log(`Current issue for ${result.publish_date} already exists. Skip this compensation run.`);
    process.exit(0);
  }
  if (result.force) console.log('Preflight force=true: continuing even though current issue may exist.');
  else console.log('Preflight passed: no current issue exists.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
