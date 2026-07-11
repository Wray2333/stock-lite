export type Theme = 'light' | 'dark';

export interface WatchItem {
  code: string;
  name: string;
}

export interface StorageData {
  watchlist: WatchItem[];
  /** Kept as `metals` for compatibility with existing persisted data. */
  metals: WatchItem[];
  theme?: Theme;
}

export const DEFAULT_WATCHLIST: WatchItem[] = [
  { code: 'sh600519', name: '贵州茅台' },
  { code: 'sz000858', name: '五粮液' },
  { code: 'sh601318', name: '中国平安' },
  { code: 'sz300750', name: '宁德时代' },
];

export const DEFAULT_FUTURES: WatchItem[] = [
  { code: 'AUM', name: '沪金主连' },
  { code: 'AGM', name: '沪银主连' },
  { code: 'GC00Y', name: 'COMEX黄金' },
  { code: 'SI00Y', name: 'COMEX白银' },
];

export const DEFAULT_STORAGE: StorageData = {
  watchlist: DEFAULT_WATCHLIST,
  metals: DEFAULT_FUTURES,
};

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function normalizeWatchItems(value: unknown, fallback: WatchItem[]): WatchItem[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter(
    (item): item is WatchItem =>
      item != null &&
      typeof item === 'object' &&
      'code' in item &&
      typeof item.code === 'string' &&
      'name' in item &&
      typeof item.name === 'string'
  );
}
