CREATE TABLE IF NOT EXISTS x_article_posts (
  id TEXT PRIMARY KEY,
  article_id TEXT,
  author_id TEXT,
  author_username TEXT,
  author_name TEXT,
  title TEXT,
  text_preview TEXT,
  lang TEXT,
  created_at TEXT,
  url TEXT,
  topic_id TEXT,
  source_query TEXT,
  bookmark_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  quote_count INTEGER DEFAULT 0,
  repost_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0,
  possibly_sensitive INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  collected_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS x_article_scores (
  post_id TEXT PRIMARY KEY,
  article_score REAL,
  bookmark_rank INTEGER,
  quality_score REAL,
  novelty_score REAL,
  learning_value_score REAL,
  business_value_score REAL,
  research_value_score REAL,
  actionability_score REAL,
  credibility_score REAL,
  hype_risk_score REAL,
  reason TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS x_article_summaries (
  post_id TEXT PRIMARY KEY,
  one_sentence TEXT,
  summary_zh TEXT,
  key_points TEXT,
  action_items TEXT,
  learning_notes TEXT,
  recommended_use TEXT,
  limitations TEXT,
  generated_at TEXT
);

CREATE TABLE IF NOT EXISTS x_article_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT,
  tag TEXT,
  tag_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_x_article_tags_post ON x_article_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_x_article_tags_tag ON x_article_tags(tag);

CREATE TABLE IF NOT EXISTS x_sources (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  domain TEXT,
  tier TEXT,
  source_score REAL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS x_article_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT,
  bookmark_count INTEGER,
  like_count INTEGER,
  quote_count INTEGER,
  repost_count INTEGER,
  reply_count INTEGER,
  impression_count INTEGER,
  captured_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_x_article_snapshots_post ON x_article_snapshots(post_id, captured_at);

CREATE TABLE IF NOT EXISTS x_article_daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT,
  report_type TEXT,
  topic_id TEXT,
  title TEXT,
  summary TEXT,
  markdown TEXT,
  created_at TEXT
);
