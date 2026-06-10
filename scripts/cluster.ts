import type { Candidate, Cluster } from './utils/types.js';
import { slugify } from './utils/text.js';
import { getDomain } from './dedupe.js';

export function assignCluster(candidate: Candidate, issueDate: string): string {
  const topic = candidate.topics[0] || candidate.tags[0] || getDomain(candidate.canonical_url) || 'article';
  const date = issueDate.replace(/-/g, '_');
  return `${slugify(topic)}_${date}`;
}

export function buildClusters(items: Candidate[]): Cluster[] {
  const groups = new Map<string, Candidate[]>();
  for (const item of items) {
    const key = item.cluster_id || 'misc';
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([cluster_id, group]) => {
    const primary = group.sort((a, b) => b.total_score - a.total_score)[0];
    return {
      cluster_id,
      title: primary.topics[0] ? `${primary.topics[0]} signal cluster` : primary.title,
      summary: `This cluster keeps one primary article and treats ${Math.max(group.length - 1, 0)} related links as supporting sources, preventing duplicate cards for the same event.`,
      primary_source: primary.canonical_url,
      supporting_sources: group.filter(i => i.id !== primary.id).map(i => i.canonical_url),
      related_x_posts: group.filter(i => i.source_platform === 'x').map(i => i.source_url),
      related_articles: group.map(i => i.canonical_url),
      entities: Array.from(new Set(group.flatMap(i => i.entities))).slice(0, 12),
      tags: Array.from(new Set(group.flatMap(i => i.tags))).slice(0, 12),
      score: Math.round(primary.total_score),
      selected_item_id: primary.id
    };
  });
}
