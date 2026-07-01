import { getProvider } from '../src/lib/providers';
import { enabledTopics } from '../src/lib/topics';

const provider = getProvider(process.env);
let total = 0;
for (const topic of enabledTopics()) {
  const items = await provider.searchArticles({ topic_id: topic.id, keywords: topic.keywords, min_bookmarks: topic.min_bookmarks, min_likes: topic.min_likes, limit: 20 });
  total += items.length;
  console.log(`[collect] ${topic.id}: ${items.length}`);
}
console.log(`[collect] provider=${provider.name} total=${total}`);
