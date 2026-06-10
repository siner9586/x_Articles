# x_Articles

Daily curated high-quality X Articles and long-form AI signals, built as a static site without paid APIs.

## 1. 项目简介

`x_Articles` 是一个长期可运行、自动更新、可部署、可维护的静态信息站点。它每日整理 X 上的高质量 Articles 与公开长文信号，默认以质量排序，热度只作为辅助信号。

站点定位不是“抓所有 X 内容”，而是建立一个合规、轻量、可复盘的 Articles 信号站：只收录 X Articles、X 作者指向的外部长文、AI 公司/研究机构/VC/媒体/开发者/投资人发布的公开长文，以及可作为 X Articles 发现入口的公开文章链接。

## 2. 项目定位：只整理高质量 Articles

主内容只允许以下类型：

- `x_article`
- `external_article`
- `company_blog_article`
- `media_article`
- `vc_article`
- `research_blog_article`

普通短帖、纯 thread、播客单集、论文条目、GitHub 仓库、产品页不能作为 selected 主卡片。它们只能作为 discovery source 或 evidence links。

## 3. 为什么不使用付费 API

本项目强调低成本、可复现和长期运行，因此不使用付费 API，不使用 X paid API，也不依赖任何需要付费授权的第三方数据接口。优先使用 RSS / Atom、公开 sitemap、公开 blog index、公司 news page、Substack RSS、人工 curated links 和公开网页元数据。

## 4. 合规边界

- 不使用 X paid API。
- 不使用任何付费第三方数据 API。
- 不绕过登录、验证码、Cloudflare、人机验证、反爬机制、rate limit 或付费墙。
- 不保存完整受版权保护的文章正文。
- 只保存标题、作者、来源、发布时间、canonical URL、meta description、Open Graph 信息、短摘录、本项目生成的摘要/判断/评论和原始链接。
- 如果 X Article 或外部文章无法合规访问，只记录链接、标题、作者、来源、`fetch_status` 和 `fetch_error`，不强行抓取正文。
- X 是发现入口和来源索引，不把不可验证的 X 内容当作事实来源。

## 5. 信息源分类

来源库位于 `data/sources/`：

- `x_accounts.yaml`：公开 X 账号与待人工确认账号。
- `company_sources.yaml`：AI 模型公司、应用公司、Agent / Coding / Infra 公司。
- `external_sources.yaml`：Cloudflare、Supabase、Neon、Modal、Together、Fireworks、云服务与数据库等公开文章入口。
- `media.yaml`：深度媒体、科技媒体、商业媒体、独立 newsletter。
- `vc_sources.yaml`：a16z、Sequoia、YC、SPC、Redpoint、Bessemer、Greylock、Lightspeed、Index、Benchmark、First Round Review。
- `research_sources.yaml`：研究机构、论文发现、技术社区与 evidence-only 来源。
- `query_templates.yaml`：英文主题词、中文主题词、信号词、排除词。
- `manual_links.yaml`：人工补充公开链接。
- `curated_x_articles.yaml`：人工确认的公开 X Articles。
- `curated_external_articles.yaml`：人工确认的外部长文。
- `blocklist.yaml`：禁止内容类型、屏蔽词与规则。
- `source_policy.md`：合规说明。

## 6. 抓取策略

每天运行：

```bash
npm run collect
npm run score
npm run build:issue
npm run qa
npm run build
```

GitHub Actions 中会设置 `X_ARTICLES_FETCH_LIVE=true` 执行真实公开 RSS/Atom 抓取；本地未设置该变量时会生成稳定的初始来源索引，避免本地网络不可用导致失败。优先抓取 RSS / Atom 和公开 blog index。正文抓取失败不会导致 workflow 失败；失败来源会进入 `data/raw/YYYY-MM-DD-run.json` 的 errors。脚本不会绕过登录墙、付费墙、验证码、反爬或 Cloudflare。

## 7. X 使用边界

X 只作为发现入口：

- 保存公开 X Article 链接。
- 保存 X 作者主页。
- 保存人工维护 curated X Articles。
- 保存外部文章中引用的 X 链接。
- 不强行抓取 X Article 全文。

## 8. 评分规则

100 分制：

```text
total_score =
source_score * 0.20 +
information_density_score * 0.20 +
originality_score * 0.15 +
trend_score * 0.15 +
evidence_score * 0.10 +
heat_score * 0.10 +
site_fit_score * 0.10
```

热度最多只占 10%，不能让流量压倒质量。

分层：

- Must Read：85–100，最多 8 条。
- Worth Reading：70–84，最多 16 条。
- Signal Watch：55–69，最多 20 条。
- Archive Only：40–54，只归档。
- Rejected：0–39，不展示。

## 9. 去重规则

每条内容生成 `dedupe_key`，至少考虑：

- canonical URL
- normalized URL
- source URL
- title hash
- semantic title key
- author + title
- external URL
- cluster ID

每次生成新一期前读取 `data/archive/used_items.json`。如果候选内容的 canonical URL、dedupe key、title hash 或 cluster ID 已存在于历史 used items，不得进入 selected。第二期不得重复第一期，第三期不得重复第一期和第二期，后续同理。旧内容可以作为 background source，但不能作为最新一期主内容。

## 10. 每日更新规则

GitHub Actions 文件：`.github/workflows/daily.yml`。

北京时间每天 06:12 自动运行。GitHub Actions 使用 UTC，因此 cron 为：

```yaml
12 22 * * *
```

workflow 支持 `workflow_dispatch` 手动触发。commit message：

```text
chore: update x articles for YYYY-MM-DD
```

脚本统一使用 `Asia/Shanghai` 日期，避免 UTC 日期误判。

## 11. 本地运行方法

```bash
npm install
npm run daily
npm run qa
npm run build

# 如需在本地尝试真实公开 RSS 抓取：
X_ARTICLES_FETCH_LIVE=true npm run collect
npm run dev
```

构建产物位于 `dist/`。

## 12. GitHub Actions 说明

`daily.yml` 会 checkout、setup Node、`npm ci`、运行 daily pipeline、再次 QA 和 build，然后只在 `data`、`content`、`public/index-data` 有变更时自动提交。workflow 只在 schedule 或 workflow_dispatch 触发，避免 push 无限循环。

`pages.yml` 可将 Astro 静态站部署到 GitHub Pages。Cloudflare Pages / Netlify 也可直接使用：

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 20

## 13. 部署说明

Cloudflare Pages：连接 `siner9586/x_Articles`，构建命令填 `npm run build`，输出目录填 `dist`。

Netlify：连接仓库，Build command 填 `npm run build`，Publish directory 填 `dist`。

GitHub Pages：启用 Pages，source 选择 GitHub Actions，由 `.github/workflows/pages.yml` 部署。

## 14. 数据结构说明

候选保存为：

- `data/candidates/YYYY-MM-DD.json`

每日 issue 保存为：

- `data/issues/YYYY-MM-DD.json`
- `content/issues/YYYY-MM-DD.md`
- `public/index-data/latest.json`
- `public/index-data/issues.json`
- `public/index-data/search.json`

历史去重保存为：

- `data/archive/used_items.json`

## 15. 如何添加新的 X 账号

编辑 `data/sources/x_accounts.yaml`，每个账号至少包含：

```yaml
- handle:
  display_name:
  category:
  organization:
  role:
  homepage_url:
  x_url:
  priority:
  language:
  notes:
  tags:
  verify_status:
```

不确定个人账号不要硬填；放入 TODO 并标注 `verify_status: needs_manual_confirmation`。

## 16. 如何添加新的外部来源

根据来源类型写入对应 YAML：公司写 `company_sources.yaml`，媒体写 `media.yaml`，VC 写 `vc_sources.yaml`，研究机构写 `research_sources.yaml`，Infra / 云 / 数据库写 `external_sources.yaml`。

## 17. 如何手动添加 curated X Article

编辑 `data/sources/curated_x_articles.yaml`。只允许公开 X Articles。普通短帖和纯 thread 不能写成主内容。

## 18. 如何避免重复使用旧内容

不要手动删除 `data/archive/used_items.json`。新增候选在 `build-issue` 阶段会和历史 used items 比较，重复 URL、dedupe key、title hash 或 cluster ID 会被阻止进入 selected。

## 19. QA 检查

`npm run qa` 检查必要文件、YAML/JSON 可解析、latest 指向真实日期、selected_count、Article 类型、重复 URL、重复 dedupe_key、历史重复、搜索索引、GitHub Actions cron、README 合规说明、公众号二维码路径、弹层默认隐藏、移动端水平居中和页面中不出现占位符。

## 20. 公众号二维码组件说明

组件路径：

- `src/components/WechatPopover.astro`

静态资源路径：

- `public/assets/wechat-qrcode.svg`

Header / 组件只引用 `/assets/wechat-qrcode.svg`。不在组件中写 base64，不内联二维码内容。二维码不点击不显示；点击“公众号”任一字符后弹出；再次点击或点击外部区域关闭。移动端弹层最大宽度不超过 86vw，并水平居中。

## 21. 常见问题

**抓不到足够真实 Articles 怎么办？**

首次运行会生成“初始来源索引期”，明确标注不是每日新闻、不是趋势结论、不是 selected Article 榜单。严禁用假文章、假作者、假公司、假新闻冒充真实内容。

**为什么有 fetch failures？**

公开来源可能没有 RSS、网络超时、拒绝非浏览器请求或内容需要登录。项目会合规降级，不强抓正文，不让 workflow 因单个来源失败而中断。

**为什么论文、GitHub、播客没有出现在主卡片？**

它们只能作为 evidence 或 discovery source。主卡片只收录 Articles。

## 22. 后续路线图

- 增加更精细的 sitemap discovery。
- 增加人工审核命令，允许手动提升或降权候选。
- 为来源添加 last_success_at 和 fetch health。
- 增加 topic cluster 可视化。
- 增加 bilingual 摘要输出。
- 增加 Cloudflare Pages 部署文档截图。
