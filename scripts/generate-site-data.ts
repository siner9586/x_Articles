import { listFiles, readJson, writeJson } from './utils/fs.js';
import { attachArticleIdentity, isXArticleUrl } from './x-article.js';

export async function generateSiteData(latestIssue: any) {
  await writeJson('public/index-data/latest.json', latestIssue);
  const files = await listFiles('data/issues', '.json');
  const issues = [] as any[];
  for (const file of files) {
    const issue = await readJson<any>(file, null);
    if (!issue?.metadata?.issue_date) continue;
    issues.push({
      issue_date: issue.metadata.issue_date,
      generated_at: issue.metadata.generated_at,
      candidates_count: issue.metadata.candidates_count,
      selected_count: issue.metadata.selected_count,
      must_read_count: issue.must_read?.length || 0,
      is_initial_source_index: Boolean(issue.metadata.is_initial_source_index),
      href: `/issues/${issue.metadata.issue_date}/`
    });
  }
  issues.sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  await writeJson('public/index-data/issues.json', issues);
  const search = issues.flatMap(meta => {
    const issue = meta.issue_date === latestIssue.metadata.issue_date ? latestIssue : null;
    const items = issue ? [...(issue.must_read || []), ...(issue.worth_reading || []), ...(issue.signal_watch || [])] : [];
    return items.map((item: any) => attachArticleIdentity(item)).filter((item: any) => isXArticleUrl(item.canonical_url)).map((item: any) => ({
      title: item.title,
      author: item.author,
      organization: item.organization,
      source_domain: item.source_domain,
      tags: item.tags,
      topics: item.topics,
      url: item.canonical_url,
      issue_date: meta.issue_date,
      summary: item.summary
    }));
  });
  await writeJson('public/index-data/search.json', search);
}
