import { mkdirSync, writeFileSync } from 'node:fs';
import { articles } from '../src/lib/mock-data';
import { generateIssueReport } from '../src/lib/reports';

mkdirSync('public/mock', { recursive: true });
writeFileSync('public/mock/articles.json', JSON.stringify({ generated_at: new Date().toISOString(), articles }, null, 2));
writeFileSync('public/mock/issue-report.json', JSON.stringify(generateIssueReport(articles), null, 2));
console.log(`seeded ${articles.length} mock articles to public/mock`);
