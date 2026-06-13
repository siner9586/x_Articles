import type { ArticleDiscoveryResult, DiscoveryInput, XArticleBackend } from './types.js';
import { extractXArticleUrls, makeDiscoveryResult, xSeedUrls } from './utils.js';

function looksBlocked(html = ''): string {
  if (/captcha|unusual activity|temporarily restricted|rate limit|login to x|sign in to x|请验证|验证码/i.test(html)) return 'login_or_verification_wall';
  return '';
}

async function maybeInstallCookies(context: any) {
  const raw = process.env.X_COOKIES_JSON || '';
  if (!raw.trim()) return;
  try {
    const cookies = JSON.parse(raw);
    if (Array.isArray(cookies)) await context.addCookies(cookies);
  } catch {
    // Never log cookie content. Invalid optional cookies simply disable the local session path.
  }
}

export class BrowserRenderBackend implements XArticleBackend {
  name = 'browser_render' as const;

  async discover(input: DiscoveryInput): Promise<ArticleDiscoveryResult[]> {
    if (process.env.X_ARTICLES_BROWSER_FETCH !== 'true') return [{
      url: 'browser_render_disabled',
      canonical_url: 'browser_render_disabled',
      discovered_at: input.capturedAt,
      fetched_at: input.capturedAt,
      backend: this.name,
      source_url: 'browser_render',
      fetch_status: 'skipped',
      fetch_error: 'X_ARTICLES_BROWSER_FETCH is not true; optional browser discovery backend skipped'
    }];
    let chromium: any;
    try {
      chromium = (await import('playwright')).chromium;
    } catch (error: any) {
      return [{
        url: 'browser_render_unavailable',
        canonical_url: 'browser_render_unavailable',
        discovered_at: input.capturedAt,
        fetched_at: input.capturedAt,
        backend: this.name,
        source_url: 'browser_render',
        fetch_status: 'failed',
        fetch_error: `playwright_unavailable:${String(error?.message || error).slice(0, 160)}`
      }];
    }

    const results: ArticleDiscoveryResult[] = [];
    const browser = await chromium.launch({ headless: input.browserHeadless });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 x_Articles compliant public renderer; no CAPTCHA bypass; no rate-limit evasion',
      viewport: { width: 1280, height: 900 }
    });
    await maybeInstallCookies(context);
    const page = await context.newPage();
    page.setDefaultTimeout(Number(process.env.X_ARTICLES_BROWSER_TIMEOUT_MS || 9000));

    try {
      const debugSnapshots = process.env.X_ARTICLES_DEBUG_SNAPSHOTS === 'true';
      const accounts = input.xAccounts.slice(0, Math.min(input.maxAccounts, 80));
      const urlsPerAccount = Number(process.env.X_ARTICLES_BROWSER_URLS_PER_ACCOUNT || 2);
      const maxPages = Number(process.env.X_ARTICLES_BROWSER_MAX_PAGES || 24);
      const globalSearches = input.searchQueries.slice(0, Math.min(input.maxSearchQueries, 30)).map(q =>
        `https://x.com/search?q=${encodeURIComponent(q.query || q.q || '')}&src=typed_query&f=live`
      );
      const visitQueue: Array<{ url: string; source: any }> = [];
      for (const account of accounts) {
        if (!account?.x_url || /TODO/i.test(`${account.handle || ''} ${account.verify_status || ''}`)) continue;
        for (const url of xSeedUrls(account).slice(0, urlsPerAccount)) visitQueue.push({ url, source: account });
      }
      for (const url of globalSearches) visitQueue.push({ url, source: { display_name: 'Global X Article search', priority: 76, tags: ['x_article_search'] } });

      let snapshotIndex = 0;
      for (const entry of visitQueue.slice(0, maxPages)) {
        try {
          await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: Number(process.env.X_ARTICLES_BROWSER_GOTO_TIMEOUT_MS || 7000) });
          await page.waitForTimeout(Number(process.env.X_ARTICLES_BROWSER_SETTLE_MS || 600));
          const html = await page.content();
          const wall = looksBlocked(html);
          if (wall) {
            results.push({
              url: entry.url,
              canonical_url: entry.url,
              discovered_at: input.capturedAt,
              fetched_at: input.capturedAt,
              backend: this.name,
              source_url: entry.url,
              source_meta: entry.source,
              fetch_status: 'failed',
              fetch_error: wall
            });
            continue;
          }
          const bodyText = await page.locator('body').innerText({ timeout: 2500 }).catch(() => '');
          const combined = `${html}\n${bodyText}`;
          if (debugSnapshots && snapshotIndex < 20) {
            const fs = await import('node:fs/promises');
            const path = await import('node:path');
            await fs.mkdir('data/raw/browser-snapshots', { recursive: true });
            const safeName = `${input.issueDate}-${String(++snapshotIndex).padStart(2, '0')}.html`;
            await fs.writeFile(path.join('data/raw/browser-snapshots', safeName), combined.slice(0, 120000), 'utf8');
          }
          const urls = extractXArticleUrls(combined, entry.url).slice(0, 40);
          for (const url of urls) {
            const item = makeDiscoveryResult({
              url,
              sourceUrl: entry.url,
              backend: this.name,
              capturedAt: input.capturedAt,
              source: entry.source,
              html,
              summary: bodyText.slice(0, 520),
              status: 'partial'
            });
            if (item) results.push(item);
          }
        } catch (error: any) {
          results.push({
            url: entry.url,
            canonical_url: entry.url,
            discovered_at: input.capturedAt,
            fetched_at: input.capturedAt,
            backend: this.name,
            source_url: entry.url,
            source_meta: entry.source,
            fetch_status: 'failed',
            fetch_error: String(error?.message || error).slice(0, 220)
          });
        }
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
    return results;
  }
}
