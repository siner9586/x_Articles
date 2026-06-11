import { generateSiteData } from './generate-site-data.js';
import { rebuildShownIndex, writeLatestSuccess, writeUsedItemsCompat } from './history-index.js';
import { listFiles, readJson, writeJson } from './utils/fs.js';

async function main() {
  const files = await listFiles('data/issues', '.json');
  const issues = (await Promise.all(files.map(file => readJson<any>(file, null)))).filter(issue => issue?.metadata?.issue_date);
  issues.sort((a, b) => b.metadata.issue_date.localeCompare(a.metadata.issue_date));
  if (issues[0]) {
    await generateSiteData(issues[0]);
    await writeLatestSuccess(issues[0]);
  }
  else {
    await writeJson('public/index-data/latest.json', {});
    await writeJson('public/index-data/issues.json', []);
    await writeJson('public/index-data/search.json', []);
  }
  const shown = await rebuildShownIndex('');
  await writeUsedItemsCompat(shown);
  console.log(`Rebuilt public indexes from ${issues.length} issues and shown-index with ${shown.length} entries.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
