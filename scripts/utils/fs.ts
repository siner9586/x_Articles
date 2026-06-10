import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; } catch { return fallback; }
}

export async function writeJson(file: string, data: unknown) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function readText(file: string, fallback = ''): Promise<string> {
  try { return await fs.readFile(file, 'utf8'); } catch { return fallback; }
}

export async function loadYamlList(file: string): Promise<any[]> {
  const raw = await readText(file, '');
  if (!raw.trim()) return [];
  const parsed = parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed?.sources && Array.isArray(parsed.sources)) return parsed.sources;
  if (parsed?.accounts && Array.isArray(parsed.accounts)) return parsed.accounts;
  if (parsed?.links && Array.isArray(parsed.links)) return parsed.links;
  for (const value of Object.values(parsed ?? {})) {
    if (Array.isArray(value)) return value as any[];
  }
  return [];
}

export async function listFiles(dir: string, ext = ''): Promise<string[]> {
  try {
    const names = await fs.readdir(dir);
    return names.filter(n => !ext || n.endsWith(ext)).map(n => path.join(dir, n)).sort();
  } catch { return []; }
}
