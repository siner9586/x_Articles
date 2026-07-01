import rawTopics from '../../config/topics.json';
import type { TopicConfig } from './types';

export const topics = rawTopics as TopicConfig[];

export function enabledTopics(): TopicConfig[] {
  return topics.filter(topic => topic.enabled);
}

export function getTopic(id: string): TopicConfig | undefined {
  return topics.find(topic => topic.id === id);
}

export function topicName(id: string): string {
  return getTopic(id)?.name || id;
}
