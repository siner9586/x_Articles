import { readFileSync } from 'node:fs';
import { articles } from '../src/lib/mock-data';
import { computeArticleScore, filterArticles, rankArticles } from '../src/lib/scoring';
import { topics } from '../src/lib/topics';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assert(topics.length >= 12, 'topics config should include at least 12 topics');
assert(topics.every(t => t.id && t.keywords.length && t.languages.length && t.enabled), 'topics should be enabled and complete');
assert(articles.length >= 20, 'mock data should include at least 20 articles');
assert(articles.every(a => /\/articles?\//.test(a.url) && a.author_username && a.created_at), 'mock articles must keep original article link, author and date');

const filtered = filterArticles(articles, { topic: 'ai', lang: 'en', minBookmarks: '10', minLikes: '10' });
assert(filtered.every(a => a.topic_id === 'ai' && a.lang === 'en'), 'filter logic should constrain topic and lang');

const byBookmarks = rankArticles(articles, 'bookmarks');
assert(byBookmarks[0].metrics.bookmark_count >= byBookmarks[1].metrics.bookmark_count, 'bookmark sort should be descending');
const byLikes = rankArticles(articles, 'likes');
assert(byLikes[0].metrics.like_count >= byLikes[1].metrics.like_count, 'like sort should be descending');
const byScore = rankArticles(articles, 'score');
assert(byScore[0].score.article_score >= byScore[1].score.article_score, 'score sort should be descending');

const emptyScore = computeArticleScore({});
assert(Number.isFinite(emptyScore.article_score), 'score function must handle empty metrics');

const pkg = readFileSync('package.json', 'utf8');
assert(!/playwright|puppeteer|selenium/i.test(pkg), 'package must not include browser automation dependencies');
const envExample = readFileSync('.env.example', 'utf8');
assert(!/sk-[A-Za-z0-9]|xox[baprs]-|ghp_[A-Za-z0-9]/.test(envExample), 'env example must not contain real-looking secrets');

console.log('✓ topics load correctly');
console.log('✓ mock article dataset is complete');
console.log('✓ filters and ranking pass');
console.log('✓ scoring handles null metrics');
console.log('✓ no browser automation dependency or obvious secret leakage detected');
