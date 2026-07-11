import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {
  createEastmoneyProxyPlugin,
  resolveEastmoneyCookie,
} from './server/eastmoneyProxyPlugin';
import { createStoragePlugin } from './server/storagePlugin';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      createStoragePlugin(),
      createEastmoneyProxyPlugin(resolveEastmoneyCookie(environment.EASTMONEY_COOKIE)),
    ],
    preview: {
      allowedHosts: ['stock.20020527.xyz'],
    },
  };
});
