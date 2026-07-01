import { articles } from './mock-data';
import { rankArticles } from './scoring';
import { topicName } from './topics';
import type { XArticle } from './types';

export function generateDailyReport(input: XArticle[] = articles, date = '2026-07-02') {
  const ranked = rankArticles(input, 'bookmarks');
  const highBookmarkCount = ranked.filter(item => item.metrics.bookmark_count >= 100).length;
  const topics = [...new Set(ranked.map(item => topicName(item.topic_id)))].slice(0, 6);
  const top = ranked.slice(0, 10);
  const questions = [
    '哪些领域的收藏数显著高于点赞数，说明更适合深度学习？',
    '哪些 Article 可以转化为项目选题或课程汇报案例？',
    '哪些金融、加密或法律相关内容需要进一步核查原文与外部资料？',
    '哪些作者值得加入高质量来源白名单？',
    '哪些方法论可以迁移到自己的产品、论文或管理实践？'
  ];
  const markdown = [
    `# 本期 X Articles 高收藏学习精选（${date}）`,
    '',
    '## 总览',
    `- 本期发现 Article 数量：${ranked.length}`,
    `- 高收藏 Article 数量：${highBookmarkCount}`,
    `- 主要主题：${topics.join('、')}`,
    '- 值得关注的新领域：AI Agent、稳定币分发、机器人数据管线、AI 决策权治理',
    '',
    '## Top 10',
    ...top.map((item, index) => [
      '',
      `### ${index + 1}. ${item.title}`,
      `- 作者：@${item.author_username} / ${item.author_name}`,
      `- 收藏：${item.metrics.bookmark_count}；点赞：${item.metrics.like_count}`,
      `- 原文：${item.url}`,
      `- 一句话摘要：${item.summary.one_sentence}`,
      `- 为什么值得学习：${item.summary.why_it_matters}`,
      `- 风险或局限：${item.summary.limitations}`
    ].join('\n')),
    '',
    '## 本期学习地图',
    ...topics.map(topic => `- ${topic}`),
    '',
    '## 值得深挖的问题',
    ...questions.map(q => `- ${q}`)
  ].join('\n');
  return {
    report_date: date,
    report_type: 'issue',
    title: `本期 X Articles 高收藏学习精选（${date}）`,
    summary: `本期共收录 ${ranked.length} 篇 mock/manual Articles，高收藏 ${highBookmarkCount} 篇，覆盖 ${topics.join('、')}。`,
    markdown,
    top,
    topics,
    questions
  };
}
