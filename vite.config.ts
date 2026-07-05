import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const EASTMONEY_KLINE_PATH = '/api/qt/stock/kline/get';
const EASTMONEY_KLINE_UPSTREAM = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';
const STORAGE_PATH = '/api/storage';
type Theme = 'light' | 'dark';

interface WatchItem {
  code: string;
  name: string;
}

interface StorageData {
  watchlist: WatchItem[];
  metals: WatchItem[];
  theme?: Theme;
}

const DEFAULT_STORAGE: StorageData = {
  watchlist: [
    { code: 'sh600519', name: '贵州茅台' },
    { code: 'sz000858', name: '五粮液' },
    { code: 'sh601318', name: '中国平安' },
    { code: 'sz300750', name: '宁德时代' },
  ],
  metals: [
    { code: 'AUM', name: '沪金主连' },
    { code: 'AGM', name: '沪银主连' },
    { code: 'GC00Y', name: 'COMEX黄金' },
    { code: 'SI00Y', name: 'COMEX白银' },
  ],
};

function storageFilePath(): string {
  return path.resolve(process.cwd(), 'data', 'storage.json');
}

function normalizeItems(value: unknown, fallback: WatchItem[]): WatchItem[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter(
    (it): it is WatchItem =>
      it && typeof it.code === 'string' && typeof it.name === 'string'
  );
  return list.length > 0 ? list : fallback;
}

function normalizeTheme(value: unknown): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

async function readStorageFile(): Promise<StorageData> {
  const file = storageFilePath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StorageData>;
    return {
      watchlist: normalizeItems(parsed.watchlist, DEFAULT_STORAGE.watchlist),
      metals: normalizeItems(parsed.metals, DEFAULT_STORAGE.metals),
      theme: normalizeTheme(parsed.theme),
    };
  } catch {
    await writeStorageFile(DEFAULT_STORAGE);
    return DEFAULT_STORAGE;
  }
}

async function writeStorageFile(data: StorageData): Promise<void> {
  const file = storageFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readRequestBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function fileStoragePlugin() {
  return {
    name: 'file-storage-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith(STORAGE_PATH)) {
          next();
          return;
        }

        try {
          if (req.method === 'GET' && url.pathname === STORAGE_PATH) {
            const data = await readStorageFile();
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(data));
            return;
          }

          if (
            req.method === 'PUT' &&
            (url.pathname === `${STORAGE_PATH}/watchlist` ||
              url.pathname === `${STORAGE_PATH}/metals` ||
              url.pathname === `${STORAGE_PATH}/theme`)
          ) {
            const raw = await readRequestBody(req);
            const parsed = JSON.parse(raw) as unknown;
            const data = await readStorageFile();
            if (url.pathname.endsWith('/watchlist')) {
              data.watchlist = normalizeItems(parsed, []);
            } else if (url.pathname.endsWith('/metals')) {
              data.metals = normalizeItems(parsed, []);
            } else {
              const theme =
                typeof parsed === 'object' && parsed && 'theme' in parsed
                  ? normalizeTheme((parsed as { theme?: unknown }).theme)
                  : undefined;
              if (!theme) {
                res.statusCode = 400;
                res.end('Invalid theme');
                return;
              }
              data.theme = theme;
            }
            await writeStorageFile(data);
            res.statusCode = 204;
            res.end();
            return;
          }

          res.statusCode = 405;
          res.end('Method Not Allowed');
        } catch (err) {
          res.statusCode = 500;
          res.end(err instanceof Error ? err.message : String(err));
        }
      });
    },
  };
}

function runCurl(url: string, cookie: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const curl = spawn(
      'curl.exe',
      [
        '-sS',
        '--max-time',
        '15',
        '--compressed',
        '-b',
        cookie,
        '-H',
        'Accept: */*',
        '-H',
        'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
        '-H',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        url,
      ],
      { windowsHide: true }
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    curl.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    curl.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    curl.on('error', reject);
    curl.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `curl exited ${code}`));
    });
  });
}

function eastmoneyKlineProxy(eastmoneyCookie: string) {
  return {
    name: 'eastmoney-kline-proxy',
    configureServer(server) {
      server.middlewares.use(EASTMONEY_KLINE_PATH, async (req, res, next) => {
        if (!req.url) {
          next();
          return;
        }
        if (!eastmoneyCookie) {
          res.statusCode = 500;
          res.end('Missing EASTMONEY_COOKIE in .env.local');
          return;
        }

        const upstream = new URL(`${EASTMONEY_KLINE_UPSTREAM}${req.url}`);
        try {
          const response = await fetch(upstream, {
            headers: {
              Accept: '*/*',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              Cookie: eastmoneyCookie,
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
            },
          });
          if (!response.ok) {
            throw new Error(`Eastmoney HTTP ${response.status}`);
          }
          res.statusCode = 200;
          res.setHeader('content-type', 'application/javascript; charset=utf-8');
          res.end(await response.text());
        } catch (fetchError) {
          try {
            const text = await runCurl(upstream.toString(), eastmoneyCookie);
            res.statusCode = 200;
            res.setHeader('content-type', 'application/javascript; charset=utf-8');
            res.end(text);
          } catch (curlError) {
            res.statusCode = 502;
            res.end(
              `Eastmoney K line proxy failed: ${
                curlError instanceof Error ? curlError.message : String(curlError)
              }; fetch fallback reason: ${
                fetchError instanceof Error ? fetchError.message : String(fetchError)
              }`
            );
          }
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), fileStoragePlugin(), eastmoneyKlineProxy(env.EASTMONEY_COOKIE ?? '')],
  };
});
