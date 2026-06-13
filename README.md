# x_Articles

Daily curated high-quality **X Articles only** signal site, built as a static site without paid APIs.

## 1. 项目简介

`x_Articles` 是一个长期可运行、自动更新、可部署、可维护的静态信息站点。它每日整理 X 上的高质量 Articles，默认以质量排序，热度只作为辅助信号。

站点定位不是“抓所有 X 内容”，也不是“抓 AI 公司官网文章”。本项目只收录可验证的公开 X Articles。外部官网文章、媒体文章、博客文章、论文、GitHub、播客、普通 X 短帖和纯 thread 只能作为 discovery / evidence / background，不能作为 selected 主卡片。

## 2. 项目定位：只收录 X Articles

selected 主卡片只允许 x_article。selected 主卡片只允许 `x_article`，并且必须同时满足：

- `content_type === 'x_article'`
- `source_platform === 'x'`
- `source_type === 'x_article'`
- `canonical_url` 必须是 X/Twitter Article URL
- URL 形态必须可识别为 X Article，例如 `/i/article/`、`/i/articles/`、`/{handle}/article/`、`/{handle}/articles/`
- `live_fetch === true`
- `discovery_run_date === issue_date`
- `fetch_status !== 'skipped'`
- 不得命中历史 `shown-index.json` 中的 URL、article_id、hash 或近似重复内容

普通短帖、纯 thread、播客单集、论文条目、GitHub 仓库、产品页、公司官网文章、媒体文章、VC 文章、研究博客文章都不能作为 selected 主卡片。

## 3. 为什么之前会出现空期

之前的主要问题不是调度次数不够，而是抓取链路过于依赖普通 HTTP。X profile、search、Articles tab 经常是动态渲染页面，普通 `fetch()` 可能只能拿到空壳、登录提示、反爬页面或不含 Article 链接的 HTML，因此会出现：

```text
selected_count = 0
candidates_count = 0
live_sources_scanned = 0
```

这说明 workflow 触发了，但没有真正获得合格 X Article 候选。另一个问题是 `curated_x_articles.yaml` 为空时，系统缺少人工种子；如果同时搜索入口和 X 动态页面都抓不到，就会得到空候选。现在采用多后端抓取和第 30 次空期落盘策略，避免前 29 次补偿空跑后提前生成空期。

## 4. 多后端抓取策略

本项目借鉴 smart backend routing 思路：不同内容类型走不同后端，所有后端输出统一进入 normalize / validate / dedupe / score 流水线。

当前后端：

1. `static_http`
   - 使用 `fetchText()` 抓公开 HTML、meta、搜索页、已知 Article URL。
   - 失败不终止 pipeline。

2. `browser_render`
   - 使用 Playwright / Chromium 渲染公开 X 页面。
   - 访问账号 `/articles`、账号主页、X search、全局 Article 搜索。
   - 从 DOM、HTML、hydration JSON、body text 中提取 X Article URL。
   - 如遇登录墙、验证码、人机验证、风控或 rate limit，记录失败并降级，不绕过。

3. `discovery_search`
   - 使用 X search URL 和公开搜索入口发现疑似 Article URL。
   - 搜索结果只作为发现入口，不把外部网页作为 selected。

4. `nitter_public`
   - 可选后端。若配置 `NITTER_URL`，可借助自建 Nitter 或内部可访问实例做 timeline/search 发现。
   - Nitter 只用于发现疑似 Article URL，最终仍必须通过 X Article URL 校验、live verify 和历史去重。
   - 未配置时自动跳过，不影响每日任务。

5. `curated_live`
   - 读取 `data/sources/curated_x_articles.yaml`。
   - 每次仍必须 live verify，不能绕过去重，不能把历史 curated 内容当新内容。

6. `fxtwitter`
   - 对已发现的 X Article URL 做公共 metadata 辅助验证。
   - 不能把普通 tweet/status 当作 Article。

默认生产启用：

```text
X_ARTICLES_FETCH_BACKENDS=static_http,browser_render,discovery_search,nitter_public,curated_live,fxtwitter
X_ARTICLES_FETCH_LIVE=true
X_ARTICLES_BROWSER_FETCH=true
X_ARTICLES_BROWSER_HEADLESS=true
X_ARTICLES_MAX_ACCOUNTS=80
X_ARTICLES_MAX_SEARCH_QUERIES=30
X_ARTICLES_MAX_CANDIDATES=200
```

## 5. 合规边界

- 不使用付费 API。
- 不使用 X paid API。
- 不使用任何付费第三方数据 API。
- 不绕过登录、验证码、人机验证、反爬机制、rate limit 或付费墙。
- 不保存完整受版权保护的文章正文。
- 只保存标题、作者、来源、发布时间、canonical URL、短摘录、本项目生成的摘要/判断/评论和原始链接。
- 如果 X Article 无法合规访问，只记录链接、标题、作者、来源、`fetch_status` 和 `fetch_error`，不强行抓取正文。
- X 是主内容来源；外部网页只能作为 evidence/background。

## 6. 信息源分类

来源库位于 `data/sources/`：

- `x_accounts.yaml`：公开 X 账号与待人工确认账号，是 X Articles 的主要发现入口。
- `x_article_search_queries.yaml`：X Article 搜索词，覆盖 AI、AI agents、LLM、AI coding、context engineering、reasoning model、智能体、大模型等主题。
- `curated_x_articles.yaml`：人工确认的公开 X Articles；每次仍需 live verify。
- `manual_links.yaml`：人工补充链接，只能作为候选入口；不能绕过 selected 的 X-only 规则。
- `external_sources.yaml`、`company_sources.yaml`、`media.yaml`、`vc_sources.yaml`、`research_sources.yaml`：只作为 evidence/background 或来源健康监控，不得进入 selected 主卡片。
- `query_templates.yaml`：英文主题词、中文主题词、信号词、排除词。
- `blocklist.yaml`：禁止内容类型、屏蔽词与规则。
- `source_policy.md`：合规说明。

## 7. URL 识别规则

允许：

```text
https://x.com/i/article/{id}
https://x.com/i/articles/{id}
https://x.com/{handle}/article/{id}
https://x.com/{handle}/articles/{id}
https://twitter.com/i/article/{id}
https://twitter.com/i/articles/{id}
https://twitter.com/{handle}/article/{id}
https://twitter.com/{handle}/articles/{id}
https://mobile.x.com/{handle}/articles/{id}
```

禁止：

```text
https://x.com/compose/articles
https://x.com/{handle}/status/{id}
https://x.com/{handle}
https://x.com/search
https://x.com/i/bookmarks
https://x.com/i/lists
https://x.com/i/status/{id}
```

`https://x.com/compose/articles` 只能作为说明入口，不能作为抓取入口或 selected URL。

## 8. 评分规则

入选前先做 Article 类型校验；不能因为热度高就收录普通 tweet。评分采用：

```text
total_score =
  quality_score * 0.30 +
  heat_score * 0.20 +
  freshness_score * 0.20 +
  source_score * 0.15 +
  article_confidence_score * 0.15
```

其中：

- `article_confidence_score`：URL、article_id、metadata、后端证据越明确越高。
- `freshness_score`：当日发现、近 24 小时发布优先。
- `heat_score`：likes、views、reposts、bookmarks、replies。
- `quality_score`：标题完整、摘要信息密度、正文片段完整、是否有分析/框架/方法论。
- `source_score`：来源账号质量。

分层：

- Must Read：85–100，最多 8 条。
- Worth Reading：70–84，最多 16 条。
- Signal Watch：55–69，最多 20 条。
- Archive Only：40–54，只归档。
- Rejected：0–39，不展示。

## 9. 去重规则

每条内容生成 `dedupe_key` 与 shown index 字段，至少考虑：

- canonical URL
- normalized URL
- article_id
- url_hash
- content_hash
- source URL
- title hash
- near title hash
- near content hash
- semantic title key
- author + title
- external URL
- cluster ID

每次生成新一期前都会从 `data/issues/*.json` 重建 `data/state/shown-index.json`。如果候选内容命中历史 canonical URL、normalized URL、article_id、url_hash、content_hash、title_hash、author_title_hash、near_title_hash、near_content_hash 或近似标题/摘要，不得进入 selected。`data/archive/used_items.json` 只保留为兼容输出，不再作为候选来源。

历史内容只能用于排除，不能用于补内容。

## 10. 每日更新与 30 次补偿

GitHub Actions 文件：`.github/workflows/daily.yml`。

正式更新时间为北京时间 06:12，补偿间隔 10 分钟，总尝试检查次数为 30 次。北京时间触发点为：

```text
06:12、06:22、06:32、06:42、06:52、07:02、07:12、07:22、07:32、07:42、07:52、08:02、08:12、08:22、08:32、08:42、08:52、09:02、09:12、09:22、09:32、09:42、09:52、10:02、10:12、10:22、10:32、10:42、10:52、11:02。
```

策略：

- 第 1～29 次：如果没有合格新增 X Articles，只写 raw run log，不生成 issue，不提交，等待后续补偿继续 live fetch。
- 第 30 次：如果仍无候选，生成诚实空期 issue：`empty_reason = no_qualified_new_x_articles`。
- 任意一次抓到合格新 Article：立即生成正式 issue。
- 正式 issue 或空期 issue 一旦存在，后续补偿全部 preflight skip。

空期文案：

```text
本期未发现合格新增 X Articles。
系统已完成当日 live fetch、历史去重和合规校验；
未使用历史展示内容补齐。
```

## 11. GitHub Secrets

可选 Secrets：

```text
X_COOKIES_JSON
NITTER_URL
```

`X_COOKIES_JSON` 只在用户自己配置时用于访问本人正常可见的 X 页面，不写入仓库，不打印日志，不保存 cookie。登录态失效时自动降级。

`NITTER_URL` 用于启用 `nitter_public` 发现后端，推荐自建、内网、只绑定本地或可信网络的实例。它只作为 discovery，不作为 selected 内容来源。

## 12. raw run log 诊断

每次 run 写入：

```text
data/raw/YYYY-MM-DD-run.json
```

重点字段：

```json
{
  "attempt_index": 1,
  "total_attempts": 30,
  "final_compensation": false,
  "live_fetch": true,
  "backends_enabled": ["static_http", "browser_render", "discovery_search", "nitter_public", "curated_live", "fxtwitter"],
  "backend_stats": {},
  "candidates_count": 0,
  "selected_count": 0,
  "history_fallback_used": false,
  "mock_used": false,
  "empty_issue_generated": false,
  "empty_reason": ""
}
```

可判断到底是 workflow 没触发、browser 没装、X 页面不可访问、搜索没有发现 Article URL、发现后被 Article 判定排除，还是历史去重排除。

## 13. 本地运行方法

```bash
npm install
npm run test
npm run qa
npm run build

X_ARTICLES_FETCH_LIVE=true \
X_ARTICLES_BROWSER_FETCH=true \
X_ARTICLES_ATTEMPT_INDEX=1 \
X_ARTICLES_TOTAL_ATTEMPTS=30 \
X_ARTICLES_FINAL_COMPENSATION=false \
npm run daily -- --dry-run

X_ARTICLES_FETCH_LIVE=true \
X_ARTICLES_BROWSER_FETCH=true \
X_ARTICLES_ATTEMPT_INDEX=30 \
X_ARTICLES_TOTAL_ATTEMPTS=30 \
X_ARTICLES_FINAL_COMPENSATION=true \
npm run daily -- --dry-run

X_ARTICLES_FETCH_LIVE=true \
X_ARTICLES_BROWSER_FETCH=true \
npm run collect
```

Playwright browser 后端需要：

```bash
npx playwright install chromium
```

构建产物位于 `dist/`。

## 14. GitHub Actions 说明

`daily.yml` 会 checkout 后先解析北京时间 publish_date、attempt index、final compensation，并做 preflight。如果 `data/issues/YYYY-MM-DD.json`、`content/issues/YYYY-MM-DD.md`、`public/index-data/latest.json`、`public/index-data/issues.json`、`data/state/shown-index.json` 或 `data/state/latest-success.json` 表明当期已存在，且 `force != true`，workflow 立即输出：

```text
Current issue for YYYY-MM-DD already exists. Skip this compensation run.
```

随后不再安装依赖、不 live fetch、不生成、不 QA、不 build、不 commit、不 push，run 以 success 结束。workflow 使用 `concurrency: x-articles-daily-${{ github.ref }}` 和 `cancel-in-progress: false`，避免多个补偿触发点并发写同一天内容。只有手动 `workflow_dispatch force=true` 才允许绕过“当期已存在”这个 preflight；即使 force=true，也不得使用历史内容作为新候选。

## 15. 添加高质量 X Article 作者和搜索词

优先添加：

- 经常写长文的 AI 创业者、研究员、开发者、产品负责人、投资人。
- 写作质量稳定、有框架/复盘/方法论的作者。
- 与 AI agents、AI coding、LLM infra、reasoning、context engineering、model release、startup memo 相关的搜索词。

不要添加：

- 只发普通短帖的账号。
- 主要发 thread、转发、新闻搬运、播客、YouTube 的账号。
- 容易触发低质量、抽奖、空投、推广、Newsletter 的搜索词。

## 16. 公众号二维码

站点仍保留表头中的「公众号：灵感与观点交流」入口。公众号二维码使用静态 SVG：

```text
public/assets/wechat-qrcode.svg
```

前端只引用路径，不使用 base64。弹层默认隐藏，点击公众号文字后显示。

## 17. 部署说明

Cloudflare Pages 是主部署链路，GitHub Actions 成功 push 到 `main` 后由 Cloudflare Pages 自动构建静态站点。GitHub Pages workflow 仅保留手动触发用于临时校验，不参与主链路。

Cloudflare Pages：

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 20

如果启用 browser 后端，GitHub Actions 会安装 Chromium。若部署平台不运行每日抓取，只负责静态构建，不需要浏览器依赖。
