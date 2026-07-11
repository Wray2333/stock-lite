import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

const COOKIE_FILE_NAME = 'eastmoney-cookie.txt';
const DEFAULT_COOKIE = [
  'qgqp_b_id=0384d1d5165178cfad2a6b3f48537928',
  'st_nvi=d1UmoPSDSo7G3bw9Igd5n9de9',
  'websitepoptg_api_time=1783139101063',
  'nid18=014d6e8b403a5ba33cd1d90a99717478',
  'nid18_create_time=1783139101851',
  'gviem=JFLxj7HdMrIN4Hp9ANTWG5c81',
  'gviem_create_time=1783139101851',
  'emshistory=%5B%22%E7%99%BD%E9%93%B6%22%5D',
  'st_si=12704992319782',
  'fullscreengg=1',
  'fullscreengg2=1',
  'st_asi=delete',
  'st_pvi=84693584213840',
  'st_sp=2025-11-03%2011%3A17%3A35',
  'st_inirUrl=https%3A%2F%2Fwww.baidu.com%2Flink',
  'st_sn=16',
  'st_psi=20260705010600788-113200301201-6644234965',
].join('; ');

const PROXY_ROUTES = [
  {
    path: '/api/qt/stock/kline/get',
    upstream: 'https://push2his.eastmoney.com/api/qt/stock/kline/get',
    label: 'K line',
  },
  {
    path: '/api/qt/stock/trends2/get',
    upstream: 'https://push2.eastmoney.com/api/qt/stock/trends2/get',
    label: 'timeline',
  },
] as const;

type MiddlewareServer = Pick<ViteDevServer, 'middlewares'> | Pick<PreviewServer, 'middlewares'>;

function normalizeCookie(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  const assignment = trimmed.match(/^EASTMONEY_COOKIE\s*=\s*(.*)$/s);
  const cookie = assignment ? assignment[1].trim() : trimmed;
  const isQuoted =
    (cookie.startsWith('"') && cookie.endsWith('"')) ||
    (cookie.startsWith("'") && cookie.endsWith("'"));
  return isQuoted ? cookie.slice(1, -1).trim() : cookie;
}

export function resolveEastmoneyCookie(environmentValue: string | undefined): string {
  const environmentCookie = normalizeCookie(environmentValue);
  if (environmentCookie) return environmentCookie;

  try {
    const filePath = path.resolve(process.cwd(), 'data', COOKIE_FILE_NAME);
    return normalizeCookie(readFileSync(filePath, 'utf8')) || DEFAULT_COOKIE;
  } catch {
    return DEFAULT_COOKIE;
  }
}

function requestWithCurl(url: string, cookie: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const child = spawn(
      command,
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
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36',
        url,
      ],
      { windowsHide: true }
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(Buffer.concat(stdout).toString('utf8'));
      reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `curl exited ${code}`));
    });
  });
}

function registerProxyRoute(
  server: MiddlewareServer,
  route: (typeof PROXY_ROUTES)[number],
  cookie: string
): void {
  server.middlewares.use(route.path, async (request, response, next) => {
    if (!request.url) return next();

    const upstreamUrl = new URL(`${route.upstream}${request.url}`);
    let fetchError: unknown;
    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        headers: {
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Cookie: cookie,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36',
        },
      });
      if (!upstreamResponse.ok) throw new Error(`Eastmoney HTTP ${upstreamResponse.status}`);
      response.setHeader('content-type', 'application/javascript; charset=utf-8');
      response.end(await upstreamResponse.text());
      return;
    } catch (error) {
      fetchError = error;
    }

    // Some deployment environments reject Node fetch TLS while curl succeeds.
    try {
      response.setHeader('content-type', 'application/javascript; charset=utf-8');
      response.end(await requestWithCurl(upstreamUrl.toString(), cookie));
    } catch (curlError) {
      response.statusCode = 502;
      response.end(
        `Eastmoney ${route.label} proxy failed: ${
          curlError instanceof Error ? curlError.message : String(curlError)
        }; fetch reason: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`
      );
    }
  });
}

export function createEastmoneyProxyPlugin(cookie: string): Plugin {
  const registerRoutes = (server: MiddlewareServer) => {
    for (const route of PROXY_ROUTES) registerProxyRoute(server, route, cookie);
  };
  return {
    name: 'eastmoney-data-proxy',
    configureServer: registerRoutes,
    configurePreviewServer: registerRoutes,
  };
}
