import {
  DEFAULT_FUTURES,
  DEFAULT_WATCHLIST,
  isTheme,
  normalizeWatchItems,
  type StorageData,
  type Theme,
  type WatchItem,
} from '../../shared/storage';

const STORAGE_API_PATH = '/api/storage';

export { DEFAULT_FUTURES, DEFAULT_WATCHLIST };
export type { StorageData, WatchItem };

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Storage HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function putJson(path: string, value: unknown): Promise<void> {
  const response = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`Storage HTTP ${response.status}`);
}

export async function loadAppStorage(): Promise<StorageData> {
  const data = await requestJson<Partial<StorageData>>(STORAGE_API_PATH);
  return {
    watchlist: normalizeWatchItems(data.watchlist, DEFAULT_WATCHLIST),
    metals: normalizeWatchItems(data.metals, DEFAULT_FUTURES),
    theme: isTheme(data.theme) ? data.theme : undefined,
  };
}

export function saveWatchlist(items: WatchItem[]): Promise<void> {
  return putJson(`${STORAGE_API_PATH}/watchlist`, items);
}

/** The endpoint name remains `/metals` to preserve existing deployment data. */
export function saveFuturesList(items: WatchItem[]): Promise<void> {
  return putJson(`${STORAGE_API_PATH}/metals`, items);
}

export function saveTheme(theme: Theme): Promise<void> {
  return putJson(`${STORAGE_API_PATH}/theme`, { theme });
}
