import { ok } from '../../../src/lib/api';
import { generateDailyReport } from '../../../src/lib/reports';

export const onRequestGet: PagesFunction = async () => ok(generateDailyReport());
