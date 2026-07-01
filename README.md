# X Articles Intelligence

Discover highly bookmarked X Articles for learning new domains.

`x_Articles` is now a production-oriented MVP for a multi-domain **X Articles intelligence, ranking, learning and reporting system**. It is designed around the official X MCP / X API path, Cloudflare Pages Functions, D1-compatible schema, AI summarization interfaces, mock data for local demos, and strict compliance boundaries.

## What this project is

- A learning radar for high-bookmark X Articles.
- A ranking system for bookmarks, likes, composite value, bookmark growth and niche quality.
- A knowledge-management entry point that keeps original X links, author attribution and published time.
- A Cloudflare-ready static Astro front end plus Pages Functions API.
- A compliant data-minimization system: post id, author metadata, public metrics, Article metadata, summaries, tags, scores and original links.

## What this project is not

- It is not a browser automation crawler.
- It is not an HTML scraping system for X pages.
- It is not a tool for copying, redistributing or training on X original article bodies.
- It is not a monitoring, harassment, profiling or sensitive-attribute inference tool.

## Compliance policy

1. This project is designed to use only the official X API / X MCP path.
2. It does not use browser automation, Playwright, Puppeteer, Selenium, Nitter, fxtwitter, HTML scraping or API-bypass logic for X collection.
3. It stores only the minimum necessary data: `post_id`, author attribution, public metrics, article metadata, generated summary, tags, scores and the original X link.
4. Original article content belongs to the author and X.
5. The front end keeps the original X link, author attribution and publish time visible.
6. Summaries are for learning, indexing and trend discovery only; users should open the original X Article to verify the complete content.
7. If an original article is deleted, restricted or unavailable, metric refresh should mark it `unavailable` or `deleted` and stop displaying details.
8. Data from this project must not be used to train large language models.
9. The project must not be used for sensitive profiling, personal monitoring, harassment or other prohibited use.

## Architecture

```text
config/topics.json
        ↓
XArticleProvider interface
  ├─ MockXArticleProvider       local demo, no secrets required
  ├─ XApiArticleProvider        official X API / app-only bearer path
  └─ XMcpArticleProvider        official https://api.x.com/mcp path, configurable tool-call wrapper
        ↓
ArticleDiscoverer / MetricsHydrator / ArticleRanker / AISummarizer / ReportGenerator
        ↓
Cloudflare D1 schema + mock fallback
        ↓
Astro dashboard + Cloudflare Pages Functions API
```

The previous non-official page discovery and browser-rendering pipeline has been removed from the default project tree. The repository no longer depends on Playwright and no longer contains X page scraping backends.

## Product pages

- `/` — Dashboard: high-bookmark Articles, today metrics, top domains and recent report.
- `/articles/` — Ranking page: time, topic, language, sorting and minimum metric filters.
- `/articles/:id/` — Static detail page for demo data, including summary, learning value, recommended use and limitations.
- `/reports/` — Daily report view and Markdown copy area.
- `/topics/` — Read-only topic configuration.
- `/compliance/` — Compliance statement.

## API routes

Cloudflare Pages Functions expose:

- `GET /api/health`
- `GET /api/articles?topic=&range=&sort=&lang=&minBookmarks=&minLikes=&limit=`
- `GET /api/articles/:id`
- `POST /api/collect`
- `POST /api/refresh-metrics`
- `POST /api/summarize`
- `GET /api/reports/daily`
- `POST /api/reports/generate`

All write routes require `ADMIN_TOKEN` in one of these forms:

```text
Authorization: Bearer <ADMIN_TOKEN>
x-admin-token: <ADMIN_TOKEN>
?admin_token=<ADMIN_TOKEN>
```

All API responses use:

```json
{ "ok": true, "data": {}, "error": null }
```

or:

```json
{ "ok": false, "data": null, "error": { "code": "ERROR_CODE", "message": "Safe error message" } }
```

## Local setup

```bash
npm install
npm run seed
npm test
npm run build
npm run dev
```

`npm run dev` builds the Astro site and starts Cloudflare Pages Functions with Wrangler so that `/api/health` and `/api/articles` are available locally.

For faster UI-only editing:

```bash
npm run dev:ui
```

## Local verification

```bash
npm test
npm run build
npm run dev
```

Then open:

```text
http://localhost:8788/
http://localhost:8788/api/health
http://localhost:8788/api/articles?sort=bookmarks
http://localhost:8788/api/articles?sort=likes
http://localhost:8788/api/articles?sort=score
```

## Database initialization

Create D1:

```bash
wrangler d1 create x_articles
```

Paste the returned database id into `wrangler.toml`, then run:

```bash
wrangler d1 migrations apply x_articles --local
wrangler d1 migrations apply x_articles --remote
```

Seed mock export files:

```bash
npm run seed
```

## Cloudflare deployment

Recommended deployment path:

1. Connect the GitHub repository to Cloudflare Pages.
2. Set build command: `npm run build`.
3. Set build output directory: `dist`.
4. Configure D1 binding: `DB -> x_articles`.
5. Add secrets:

```bash
wrangler secret put X_BEARER_TOKEN
wrangler secret put X_CLIENT_ID
wrangler secret put X_CLIENT_SECRET
wrangler secret put OPENAI_API_KEY
wrangler secret put ADMIN_TOKEN
wrangler secret put CLOUDFLARE_API_TOKEN
```

6. Apply migrations remotely:

```bash
wrangler d1 migrations apply x_articles --remote
```

7. Validate:

```bash
curl https://<your-site>/api/health
curl "https://<your-site>/api/articles?sort=bookmarks&limit=10"
```

## Official X MCP / X API configuration

Environment variables:

```bash
X_PROVIDER=mock            # mock | xapi | xmcp
X_BEARER_TOKEN=
X_CLIENT_ID=
X_CLIENT_SECRET=
X_MCP_URL=https://api.x.com/mcp
X_DOCS_MCP_URL=https://docs.x.com/mcp
```

Provider behavior:

- `mock`: local demo, no network and no secrets.
- `xapi`: uses official X API endpoints with `X_BEARER_TOKEN` and requested post fields such as `id`, `text`, `author_id`, `created_at`, `public_metrics`, `entities`, `lang`, `possibly_sensitive` and Article metadata when available to the app/package.
- `xmcp`: reserved for official MCP tool-call integration through `https://api.x.com/mcp`; the concrete MCP tool names can be configured as the X MCP tool surface evolves.

For MCP client setup, use the hosted X MCP server URL `https://api.x.com/mcp` and the docs MCP URL `https://docs.x.com/mcp`. The official X docs describe both the app-only bearer route and the `xurl mcp` bridge route.

## AI summarization

Environment variables:

```bash
OPENAI_API_KEY=
AI_PROVIDER=openai
AI_MODEL=gpt-4.1-mini
MAX_AI_SUMMARIES_PER_RUN=20
```

The current MVP includes deterministic mock summaries and a provider interface. The summarizer deliberately separates visible source facts from AI inference and adds low-confidence warnings when only post previews are available.

## Topics

Topics are configurable in `config/topics.json`. Each topic includes:

```json
{
  "id": "ai",
  "name": "AI / LLM / Agent",
  "description": "AI、智能体、MCP、LLM、AI Coding 等领域高价值长文",
  "keywords": ["AI agents", "MCP", "LLM", "AI coding", "OpenAI", "Claude", "Grok"],
  "languages": ["en", "zh"],
  "min_bookmarks": 20,
  "min_likes": 50,
  "enabled": true
}
```

Different topics may use different thresholds.

## Testing coverage

`npm test` validates:

1. Topics load correctly.
2. Article filtering only keeps Article-like records.
3. Bookmark ranking sorts by `bookmark_count DESC`.
4. Like ranking sorts by `like_count DESC`.
5. Composite ranking sorts by `article_score DESC`.
6. Scoring handles null or missing metrics safely.
7. Mock data contains at least 20 cross-domain Articles.
8. No browser scraping or Playwright dependency exists in `package.json`.
9. No secret-looking token appears in tracked config examples.

## Security notes

- Do not commit `.env` or real tokens.
- Write APIs are protected by `ADMIN_TOKEN`.
- API errors are sanitized before being returned to the client.
- Raw X Article bodies are intentionally not stored by default.

## Production gaps to fill after secrets are available

- Configure actual X Developer app credentials.
- Confirm exact X API package access for Article metadata and bookmark metrics.
- Bind a real D1 database and run remote migrations.
- Configure Cloudflare Cron Triggers for `POST /api/collect`, `POST /api/refresh-metrics` and `POST /api/reports/generate`.
- Configure OpenAI or another AI provider for real summaries.
