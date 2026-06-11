import { spawnSync } from 'node:child_process';
import { appendRunLog } from './history-index.js';
import { resolvePreflight } from './preflight.js';
import { beijingDate } from './utils/time.js';
import { readJson } from './utils/fs.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force') || process.env.X_ARTICLES_FORCE === 'true';
const publishDate = process.env.ISSUE_DATE || beijingDate();

function runStep(name: string, command: string, commandArgs: string[]) {
  console.log(`\n[stage] ${name}`);
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ISSUE_DATE: publishDate,
      TZ: 'Asia/Shanghai',
      X_ARTICLES_FETCH_LIVE: 'true',
      X_ARTICLES_REQUIRE_LIVE_SELECTED: 'true',
      X_ARTICLES_PRODUCTION: 'true'
    }
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

async function main() {
  console.log(`[stage] Resolve Beijing publish_date`);
  console.log(`publish_date=${publishDate} timezone=Asia/Shanghai`);
  console.log(`dry_run=${dryRun} force=${force}`);

  console.log('\n[stage] Preflight: check current issue exists');
  const preflight = await resolvePreflight(force, publishDate);
  if (preflight.exists) console.log(`preflight_existing_evidence=${preflight.evidence.join(',')}`);
  if (preflight.should_skip) {
    console.log(`Current issue for ${publishDate} already exists. Skip this compensation run.`);
    console.log('skip_proof=no live fetch, no generation, no QA, no build, no commit, no push after preflight');
    await appendRunLog({ phase: 'preflight', publish_date: publishDate, status: 'skipped_existing_issue', evidence: preflight.evidence, dry_run: dryRun });
    return;
  }
  console.log('preflight_result=no_current_issue');
  console.log('candidate_policy=current live fetch is the only candidate source');
  console.log('history_policy=historical issues are read only for exclusion and idempotency, never for generation');
  console.log('fallback_policy=no mock, no fixture, no sample, no historical fallback, no previous issue copy');

  if (dryRun) {
    const latest = await readJson<any>('public/index-data/latest.json', null);
    if (latest?.metadata?.issue_date) {
      const skipCheck = await resolvePreflight(false, latest.metadata.issue_date);
      console.log(`dry_run_existing_issue_skip_check_date=${latest.metadata.issue_date}`);
      console.log(`dry_run_existing_issue_would_skip=${skipCheck.should_skip}`);
      if (skipCheck.should_skip) console.log(`Current issue for ${latest.metadata.issue_date} already exists. Skip this compensation run.`);
    }
    console.log('\n[stage] Dry-run stop');
    console.log('dry_run_result=preflight passed; production stages would run live fetch, validation, historical exclusion, scoring, generation, QA, build, commit');
    await appendRunLog({ phase: 'dry_run', publish_date: publishDate, status: 'would_run_live_pipeline', dry_run: true });
    return;
  }

  runStep('Live fetch X Articles', 'npx', ['tsx', 'scripts/collect-sources.ts']);
  runStep('Score and rank current live candidates', 'npx', ['tsx', 'scripts/score-candidates.ts']);
  runStep('Generate current issue from remaining new candidates only', 'npx', ['tsx', 'scripts/build-issue.ts']);
  runStep('QA: verify no historical content reused', 'npx', ['tsx', 'scripts/qa.ts']);
  runStep('Build site', 'npm', ['run', 'build']);
  console.log('\n[stage] Log result');
  console.log(`daily pipeline finished for ${publishDate}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
