import { fail, isAuthorized, ok } from '../../../src/lib/api';
import { generateIssueReport } from '../../../src/lib/reports';

export const onRequestPost: PagesFunction<Record<string, string | undefined>> = async ({ request, env }) => {
  if (!isAuthorized(request, env)) return fail('UNAUTHORIZED', 'ADMIN_TOKEN is required for report generation.', 401);
  return ok({ generated: true, report: generateIssueReport(), persisted: false });
};
