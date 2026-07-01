import { mkdirSync, writeFileSync } from 'node:fs';
import { generateDailyReport } from '../src/lib/reports';

const report = generateDailyReport();
mkdirSync('data/reports', { recursive: true });
writeFileSync(`data/reports/${report.report_date}-daily.md`, report.markdown);
writeFileSync(`data/reports/${report.report_date}-daily.json`, JSON.stringify(report, null, 2));
console.log(`[reports] generated ${report.title}`);
