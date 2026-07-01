import { articles } from '../src/lib/mock-data';
import { getProvider } from '../src/lib/providers';

const provider = getProvider(process.env);
const refreshed = await provider.refreshMetrics(articles.map(item => item.id));
console.log(`[refresh-metrics] provider=${provider.name} refreshed=${refreshed.length}`);
