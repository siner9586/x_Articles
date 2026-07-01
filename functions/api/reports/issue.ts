import { ok } from '../../../src/lib/api';
import { generateIssueReport } from '../../../src/lib/reports';

export const onRequestGet: PagesFunction = async () => ok(generateIssueReport());
