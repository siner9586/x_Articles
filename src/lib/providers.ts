import { articles } from './mock-data';
import { filterArticles } from './scoring';
import type { ArticleMetrics, ArticleSearchParams, XArticle, XArticleProvider } from './types';

function paramsToRecord(params: ArticleSearchParams): Record<string, string | undefined> {
  return {
    topic: params.topic_id,
    lang: params.language,
    minBookmarks: params.min_bookmarks ? String(params.min_bookmarks) : undefined,
    minLikes: params.min_likes ? String(params.min_likes) : undefined
  };
}

export class MockXArticleProvider implements XArticleProvider {
  name = 'mock';

  async searchArticles(params: ArticleSearchParams = {}): Promise<XArticle[]> {
    return filterArticles(articles, paramsToRecord(params)).slice(0, params.limit || 100);
  }

  async refreshMetrics(postIds: string[]): Promise<Array<{ post_id: string; metrics: ArticleMetrics; status?: XArticle['status'] }>> {
    return articles
      .filter(article => postIds.includes(article.id) || postIds.includes(article.article_id))
      .map(article => ({ post_id: article.id, metrics: article.metrics, status: article.status }));
  }
}

export class XApiArticleProvider implements XArticleProvider {
  name = 'xapi';
  constructor(private env: Record<string, string | undefined>) {}

  private bearer(): string {
    const token = this.env.X_BEARER_TOKEN;
    if (!token) throw new Error('X_BEARER_TOKEN is required for XApiArticleProvider.');
    return token;
  }

  async searchArticles(params: ArticleSearchParams = {}): Promise<XArticle[]> {
    const queryTerms = [params.keywords?.join(' OR '), params.topic_id, 'article'].filter(Boolean).join(' ');
    const url = new URL('https://api.x.com/2/tweets/search/recent');
    url.searchParams.set('query', queryTerms || 'article');
    url.searchParams.set('max_results', String(Math.min(params.limit || 20, 100)));
    url.searchParams.set('tweet.fields', 'id,text,author_id,created_at,public_metrics,entities,lang,possibly_sensitive,article');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'id,username,name,verified,public_metrics');

    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.bearer()}` } });
    if (!response.ok) throw new Error(`X API request failed with ${response.status}`);
    const payload = await response.json<any>();

    // The official API response surface may vary by package/access. This adapter deliberately stores
    // only public metadata and generated summaries. If Article metadata is not returned, the item is
    // not emitted as an Article candidate.
    const users = new Map<string, any>((payload.includes?.users || []).map((u: any) => [u.id, u]));
    const mapped: XArticle[] = [];
    for (const tweet of payload.data || []) {
      if (!tweet.article && !/\/articles?\//.test(tweet.text || '')) continue;
      const user = users.get(tweet.author_id) || {};
      const metrics = {
        bookmark_count: Number(tweet.public_metrics?.bookmark_count || 0),
        like_count: Number(tweet.public_metrics?.like_count || 0),
        quote_count: Number(tweet.public_metrics?.quote_count || 0),
        repost_count: Number(tweet.public_metrics?.retweet_count || tweet.public_metrics?.repost_count || 0),
        reply_count: Number(tweet.public_metrics?.reply_count || 0),
        impression_count: Number(tweet.public_metrics?.impression_count || 0)
      };
      const articleId = tweet.article?.id || tweet.id;
      const articleUrl = tweet.article?.url || `https://x.com/${user.username || 'i'}/articles/${articleId}`;
      const base = (await import('./mock-data')).articles[0];
      mapped.push({
        ...base,
        id: tweet.id,
        article_id: articleId,
        author_id: tweet.author_id,
        author_username: user.username || '',
        author_name: user.name || user.username || 'X author',
        title: tweet.article?.title || tweet.text?.split('\n')[0]?.slice(0, 140) || 'X Article',
        text_preview: tweet.text || '',
        lang: tweet.lang || params.language || 'en',
        created_at: tweet.created_at,
        url: articleUrl,
        topic_id: params.topic_id || 'ai',
        source_query: queryTerms,
        possibly_sensitive: Boolean(tweet.possibly_sensitive),
        metrics
      });
    }
    return mapped;
  }

  async refreshMetrics(postIds: string[]): Promise<Array<{ post_id: string; metrics: ArticleMetrics; status?: XArticle['status'] }>> {
    if (!postIds.length) return [];
    const url = new URL('https://api.x.com/2/tweets');
    url.searchParams.set('ids', postIds.join(','));
    url.searchParams.set('tweet.fields', 'id,public_metrics');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.bearer()}` } });
    if (!response.ok) throw new Error(`X API metrics request failed with ${response.status}`);
    const payload = await response.json<any>();
    return (payload.data || []).map((tweet: any) => ({
      post_id: tweet.id,
      metrics: {
        bookmark_count: Number(tweet.public_metrics?.bookmark_count || 0),
        like_count: Number(tweet.public_metrics?.like_count || 0),
        quote_count: Number(tweet.public_metrics?.quote_count || 0),
        repost_count: Number(tweet.public_metrics?.retweet_count || tweet.public_metrics?.repost_count || 0),
        reply_count: Number(tweet.public_metrics?.reply_count || 0),
        impression_count: Number(tweet.public_metrics?.impression_count || 0)
      },
      status: 'active'
    }));
  }
}

export class XMcpArticleProvider implements XArticleProvider {
  name = 'xmcp';
  constructor(private env: Record<string, string | undefined>) {}

  async searchArticles(): Promise<XArticle[]> {
    if (!this.env.X_MCP_URL) throw new Error('X_MCP_URL is required.');
    throw new Error('XMcpArticleProvider is reserved for official X MCP tool-call wiring. Configure the MCP client with https://api.x.com/mcp or use XApiArticleProvider for server-side app-only reads.');
  }

  async refreshMetrics(): Promise<Array<{ post_id: string; metrics: ArticleMetrics; status?: XArticle['status'] }>> {
    throw new Error('XMcpArticleProvider metric refresh requires configured official X MCP tool names and scopes.');
  }
}

export function getProvider(env: Record<string, string | undefined> = process.env): XArticleProvider {
  const provider = (env.X_PROVIDER || 'mock').toLowerCase();
  if (provider === 'xapi') return new XApiArticleProvider(env);
  if (provider === 'xmcp') return new XMcpArticleProvider(env);
  return new MockXArticleProvider();
}
