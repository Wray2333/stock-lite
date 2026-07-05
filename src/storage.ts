/**
 * 自选列表持久化：通过本地开发服务写入 data/storage.json
 */
import type { Theme } from './theme';

export interface WatchItem {
  code: string;
  name: string;
}

export interface AppStorageData {
  watchlist: WatchItem[];
  metals: WatchItem[];
  theme?: Theme;
}

export const DEFAULT_WATCHLIST: WatchItem[] = [
  { code: 'sh600519', name: '贵州茅台' },
  { code: 'sz000858', name: '五粮液' },
  { code: 'sh601318', name: '中国平安' },
  { code: 'sz300750', name: '宁德时代' },
];

export const DEFAULT_METALS: WatchItem[] = [
  { code: 'AUM', name: '沪金主连' },
  { code: 'AGM', name: '沪银主连' },
  { code: 'GC00Y', name: 'COMEX黄金' },
  { code: 'SI00Y', name: 'COMEX白银' },
];

const DEFAULT_STORAGE: AppStorageData = {
  watchlist: DEFAULT_WATCHLIST,
  metals: DEFAULT_METALS,
};

function normalizeItems(value: unknown, fallback: WatchItem[]): WatchItem[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter(
    (it): it is WatchItem =>
      it && typeof it.code === 'string' && typeof it.name === 'string'
  );
  return list.length > 0 ? list : fallback;
}

export async function loadStorage(): Promise<AppStorageData> {
  const res = await fetch('/api/storage', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Storage HTTP ${res.status}`);
  const data = (await res.json()) as Partial<AppStorageData>;
  return {
    watchlist: normalizeItems(data.watchlist, DEFAULT_WATCHLIST),
    metals: normalizeItems(data.metals, DEFAULT_METALS),
    theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : undefined,
  };
}

async function saveItems(path: string, list: WatchItem[]): Promise<void> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(list),
  });
  if (!res.ok) {
    throw new Error(`Storage HTTP ${res.status}`);
  }
}

export async function saveWatchlist(list: WatchItem[]): Promise<void> {
  await saveItems('/api/storage/watchlist', list);
}

export async function saveMetals(list: WatchItem[]): Promise<void> {
  await saveItems('/api/storage/metals', list);
}

export async function saveTheme(theme: Theme): Promise<void> {
  const res = await fetch('/api/storage/theme', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme }),
  });
  if (!res.ok) {
    throw new Error(`Storage HTTP ${res.status}`);
  }
}

export { DEFAULT_STORAGE };
