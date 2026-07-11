import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import {
  DEFAULT_STORAGE,
  isTheme,
  normalizeWatchItems,
  type StorageData,
} from '../shared/storage';

const STORAGE_API_PATH = '/api/storage';
type MiddlewareServer = Pick<ViteDevServer, 'middlewares'> | Pick<PreviewServer, 'middlewares'>;

function getStorageFilePath(): string {
  return path.resolve(process.cwd(), 'data', 'storage.json');
}

function createDefaultStorage(): StorageData {
  return {
    watchlist: [...DEFAULT_STORAGE.watchlist],
    metals: [...DEFAULT_STORAGE.metals],
  };
}

async function writeStorage(data: StorageData): Promise<void> {
  const filePath = getStorageFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readStorage(): Promise<StorageData> {
  try {
    const raw = await fs.readFile(getStorageFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StorageData>;
    return {
      watchlist: normalizeWatchItems(parsed.watchlist, DEFAULT_STORAGE.watchlist),
      metals: normalizeWatchItems(parsed.metals, DEFAULT_STORAGE.metals),
      theme: isTheme(parsed.theme) ? parsed.theme : undefined,
    };
  } catch {
    const defaults = createDefaultStorage();
    await writeStorage(defaults);
    return defaults;
  }
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function registerStorageMiddleware(server: MiddlewareServer): void {
  server.middlewares.use(async (request, response, next) => {
    if (!request.url) return next();

    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith(STORAGE_API_PATH)) return next();

    try {
      if (request.method === 'GET' && url.pathname === STORAGE_API_PATH) {
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(await readStorage()));
        return;
      }

      const isSupportedUpdate =
        request.method === 'PUT' &&
        [`${STORAGE_API_PATH}/watchlist`, `${STORAGE_API_PATH}/metals`, `${STORAGE_API_PATH}/theme`].includes(
          url.pathname
        );

      if (!isSupportedUpdate) {
        response.statusCode = 405;
        response.end('Method Not Allowed');
        return;
      }

      const body = JSON.parse(await readRequestBody(request)) as unknown;
      const data = await readStorage();
      if (url.pathname.endsWith('/watchlist')) {
        data.watchlist = normalizeWatchItems(body, []);
      } else if (url.pathname.endsWith('/metals')) {
        data.metals = normalizeWatchItems(body, []);
      } else {
        const theme =
          body != null && typeof body === 'object' && 'theme' in body
            ? (body as { theme?: unknown }).theme
            : undefined;
        if (!isTheme(theme)) {
          response.statusCode = 400;
          response.end('Invalid theme');
          return;
        }
        data.theme = theme;
      }

      await writeStorage(data);
      response.statusCode = 204;
      response.end();
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
}

export function createStoragePlugin(): Plugin {
  return {
    name: 'file-storage-api',
    configureServer: registerStorageMiddleware,
    configurePreviewServer: registerStorageMiddleware,
  };
}
