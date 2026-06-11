import assert from 'node:assert/strict';
import { duplicateReason } from './history-index.js';
import {
  attachArticleIdentity,
  canonicalizeUrl,
  extractXArticleId,
  isForbiddenPrimaryUrl,
  isXArticleUrl,
  xArticleVerdict
} from './x-article.js';

function testXArticleRules() {
  const allowed = [
    'https://x.com/i/article/1234567890',
    'https://x.com/i/articles/1234567890',
    'https://x.com/alice/article/abc123',
    'https://x.com/alice/articles/abc123',
    'https://twitter.com/i/article/1234567890',
    'https://twitter.com/i/articles/1234567890',
    'https://twitter.com/alice/article/abc123',
    'https://twitter.com/alice/articles/abc123',
    'https://mobile.x.com/alice/articles/abc123'
  ];
  for (const url of allowed) assert.equal(isXArticleUrl(url), true, `allowed article URL rejected: ${url}`);
  const a = 'https://twitter.com/alice/articles/abc123?utm_source=newsletter&ref=foo';
  assert.equal(canonicalizeUrl(a), 'https://x.com/alice/articles/abc123');
  assert.equal(isXArticleUrl(a), true);
  assert.equal(extractXArticleId(a), 'alice/abc123');

  const blocked = [
    'https://x.com/compose/articles',
    'https://x.com/alice/status/123',
    'https://x.com/alice',
    'https://x.com/search?q=ai',
    'https://x.com/i/bookmarks',
    'https://x.com/i/lists/123',
    'https://x.com/i/status/123'
  ];
  for (const url of blocked) assert.equal(isXArticleUrl(url), false, `blocked URL accepted: ${url}`);
  assert.equal(isForbiddenPrimaryUrl('https://youtube.com/watch?v=x'), true);
  assert.equal(isForbiddenPrimaryUrl('https://x.com/alice/status/123'), true);
}

function testVerdict() {
  const item = {
    canonical_url: 'https://x.com/alice/articles/abc123',
    content_type: 'x_article',
    source_platform: 'x',
    source_type: 'x_article',
    title: 'How we built a reliable AI coding workflow',
    author: 'Alice'
  };
  assert.equal(xArticleVerdict(item).ok, true);
  assert.equal(xArticleVerdict({ ...item, content_type: 'external_article' }).ok, false);
  assert.equal(xArticleVerdict({ ...item, canonical_url: 'https://x.com/alice/status/123' }).ok, false);
}

function testHistoryDuplicateRules() {
  const historyItem = attachArticleIdentity({
    canonical_url: 'https://x.com/alice/articles/abc123',
    title: 'How we built a reliable AI coding workflow',
    author: 'Alice',
    summary: 'A detailed framework for AI coding teams.'
  });
  const reason = duplicateReason({
    canonical_url: 'https://twitter.com/alice/articles/abc123?utm_campaign=x',
    title: 'How we built a reliable AI coding workflow',
    author: 'Alice',
    summary: 'A detailed framework for AI coding teams.'
  }, [{
    canonical_url: historyItem.canonical_url,
    normalized_url: historyItem.normalized_url!,
    article_id: historyItem.article_id!,
    url_hash: historyItem.url_hash!,
    content_hash: historyItem.content_hash!,
    title_hash: historyItem.title_hash,
    author_title_hash: historyItem.author_title_hash!,
    near_title_hash: historyItem.near_title_hash!,
    near_content_hash: historyItem.near_content_hash!,
    author: historyItem.author || '',
    title: historyItem.title,
    summary: historyItem.summary,
    shown_date: '2026-06-10',
    source_file: 'data/issues/2026-06-10.json'
  }]);
  assert.match(reason, /historical/);
}

testXArticleRules();
testVerdict();
testHistoryDuplicateRules();
console.log('Tests passed: X Article detection, URL canonicalization, forbidden primary URLs, historical duplicate rules.');
