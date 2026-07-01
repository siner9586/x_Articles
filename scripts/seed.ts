import { mkdirSync, writeFileSync } from 'node:fs';
import { articles } from '../src/lib/mock-data';
import { generateDailyReport } from '../src/lib/reports';

mkdirSync('public/mock', { recursive: true });
writeFileSync('public/mock/articles.json', JSON.stringify({ generated_at: new Date().toISOString(), articles }, null, 2));
writeFileSync('public/mock/daily-report.json', JSON.stringify(generateDailyReport(articles), null, 2));
console.log(`seeded ${articles.length} mock articles to public/mock`);
