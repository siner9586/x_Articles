import { mkdirSync, writeFileSync } from 'node:fs';
import { generateIssueReport } from '../src/lib/reports';

const report = generateIssueReport();
mkdirSync('data/reports', { recursive: true });
writeFileSync(`data/reports/${report.report_date}-issue.md`, report.markdown);
writeFileSync(`data/reports/${report.report_date}-issue.json`, JSON.stringify(report, null, 2));
console.log(`[reports] generated ${report.title}`);
