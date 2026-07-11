import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import Watchlist, { type SidebarTab } from './components/sidebar/Watchlist';
import StockDetail from './components/detail/StockDetail';
import FuturesDetail from './components/detail/FuturesDetail';
import ThemeToggle from './components/common/ThemeToggle';
import {
  fetchFuturesQuotes,
  fetchSecurityQuotes,
  isSupportedFuturesCode,
} from './services/marketData';
import {
  DEFAULT_FUTURES,
  DEFAULT_WATCHLIST,
  loadAppStorage,
  saveFuturesList,
  saveTheme,
  saveWatchlist,
  type WatchItem,
} from './services/storage';
import type { FuturesQuote, SecurityQuote, Theme } from './types/market';

const QUOTE_REFRESH_MS = 5000;
const FUTURES_REFRESH_MS = 15000;
function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initializeThemeFromSystem(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const theme = getSystemTheme();
  document.documentElement.dataset.theme = theme;
  return theme;
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('stock');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => initializeThemeFromSystem());

  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [selectedStock, setSelectedStock] = useState<string | null>(
    () => DEFAULT_WATCHLIST[0]?.code ?? null
  );
  const [stockQuotes, setStockQuotes] = useState<Map<string, SecurityQuote>>(new Map());

  const [futures, setFutures] = useState<WatchItem[]>(() =>
    DEFAULT_FUTURES.filter((item) => isSupportedFuturesCode(item.code))
  );
  const [selectedFutures, setSelectedFutures] = useState<string | null>(
    () => DEFAULT_FUTURES.find((item) => isSupportedFuturesCode(item.code))?.code ?? null
  );
  const [futuresQuotes, setFuturesQuotes] = useState<Map<string, FuturesQuote>>(new Map());

  useEffect(() => {
    let isCancelled = false;
    loadAppStorage()
      .then((data) => {
        if (isCancelled) return;
        const storedFutures = data.metals.filter((item) => isSupportedFuturesCode(item.code));
        setWatchlist(data.watchlist);
        if (data.theme) {
          applyTheme(data.theme);
          setTheme(data.theme);
        }
        setSelectedStock((current) =>
          current && data.watchlist.some((w) => w.code === current)
            ? current
            : data.watchlist[0]?.code ?? null
        );
        setFutures(storedFutures);
        setSelectedFutures((current) =>
          current && storedFutures.some((item) => item.code === current)
            ? current
            : storedFutures[0]?.code ?? null
        );
      })
      .catch(() => {
        // 文件存储不可用时保留默认列表，避免页面空白。
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  // 股票行情轮询：自选列表 + 当前选中（仅自选 tab 激活时）
  useEffect(() => {
    if (activeTab !== 'stock') return;
    const codes = [
      ...new Set([...watchlist.map((item) => item.code), selectedStock].filter(Boolean)),
    ] as string[];
    if (codes.length === 0) return;

    let isCancelled = false;
    const refreshSecurityQuotes = async () => {
      try {
        const map = await fetchSecurityQuotes(codes);
        if (!isCancelled && map.size > 0) {
          setStockQuotes((prev) => {
            const next = new Map(prev);
            for (const [k, v] of map) next.set(k, v);
            return next;
          });
        }
      } catch {
        // 行情拉取失败时保留上一次数据，等待下轮刷新
      }
    };
    void refreshSecurityQuotes();
    const timer = setInterval(refreshSecurityQuotes, QUOTE_REFRESH_MS);
    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [activeTab, watchlist, selectedStock]);

  // 期货行情轮询：全球期货接口是全量列表，刷新间隔放宽（仅期货 tab 激活时）
  useEffect(() => {
    if (activeTab !== 'futures') return;
    const codes = [
      ...new Set([...futures.map((item) => item.code), selectedFutures].filter(Boolean)),
    ] as string[];
    if (codes.length === 0) return;

    let isCancelled = false;
    const refreshFuturesQuotes = async () => {
      try {
        const map = await fetchFuturesQuotes(codes);
        if (!isCancelled && map.size > 0) {
          setFuturesQuotes((prev) => {
            const next = new Map(prev);
            for (const [k, v] of map) next.set(k, v);
            return next;
          });
        }
      } catch {
        // 失败保留旧数据
      }
    };
    void refreshFuturesQuotes();
    const timer = setInterval(refreshFuturesQuotes, FUTURES_REFRESH_MS);
    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [activeTab, futures, selectedFutures]);

  const handleAddStock = useCallback((item: WatchItem) => {
    setWatchlist((prev) => {
      if (prev.some((w) => w.code === item.code)) return prev;
      const next = [...prev, item];
      void saveWatchlist(next);
      return next;
    });
  }, []);

  const handleRemoveStock = useCallback(
    (code: string) => {
      setWatchlist((prev) => {
        const next = prev.filter((w) => w.code !== code);
        void saveWatchlist(next);
        if (selectedStock === code) {
          setSelectedStock(next[0]?.code ?? null);
        }
        return next;
      });
    },
    [selectedStock]
  );

  const handleAddFutures = useCallback((item: WatchItem) => {
    setFutures((prev) => {
      if (prev.some((entry) => entry.code === item.code)) return prev;
      const next = [...prev, item];
      void saveFuturesList(next);
      return next;
    });
  }, []);

  const handleRemoveFutures = useCallback(
    (code: string) => {
      setFutures((prev) => {
        const next = prev.filter((item) => item.code !== code);
        void saveFuturesList(next);
        if (selectedFutures === code) {
          setSelectedFutures(next[0]?.code ?? null);
        }
        return next;
      });
    },
    [selectedFutures]
  );

  const isFuturesTab = activeTab === 'futures';
  const detailCode = isFuturesTab ? selectedFutures : selectedStock;

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = media.matches ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
    void saveTheme(next);
  }, [theme]);

  const handleSelectStock = useCallback((code: string) => {
    setSelectedStock(code);
    setMobileSidebarOpen(false);
  }, []);

  const handleSelectFutures = useCallback((code: string) => {
    setSelectedFutures(code);
    setMobileSidebarOpen(false);
  }, []);

  const handleShowSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches) {
      setMobileSidebarOpen(true);
      return;
    }
    setDesktopSidebarCollapsed(false);
  }, []);

  return (
    <div
      className={`app${mobileSidebarOpen ? ' mobile-sidebar-open' : ''}${
        desktopSidebarCollapsed ? ' desktop-sidebar-collapsed' : ''
      }`}
    >
      <button
        type="button"
        className="mobile-sidebar-backdrop"
        aria-label="关闭列表"
        onClick={() => setMobileSidebarOpen(false)}
      />
      <div className="sidebar-shell">
        <button
          type="button"
          className="sidebar-collapse-button"
          aria-label="隐藏左侧栏"
          title="隐藏左侧栏"
          onClick={() => setDesktopSidebarCollapsed(true)}
        >
          ‹
        </button>
        <Watchlist
          activeTab={activeTab}
          onTabChange={setActiveTab}
          watchlist={watchlist}
          quotes={stockQuotes}
          selected={selectedStock}
          onSelect={handleSelectStock}
          onAdd={handleAddStock}
          onRemove={handleRemoveStock}
          futures={futures}
          futuresQuotes={futuresQuotes}
          selectedFutures={selectedFutures}
          onSelectFutures={handleSelectFutures}
          onAddFutures={handleAddFutures}
          onRemoveFutures={handleRemoveFutures}
        />
      </div>
      {detailCode ? (
        isFuturesTab ? (
          <FuturesDetail
            code={detailCode}
            name={futures.find((item) => item.code === detailCode)?.name}
            quote={futuresQuotes.get(detailCode)}
            theme={theme}
            onToggleTheme={toggleTheme}
            onShowSidebar={handleShowSidebar}
          />
        ) : (
          <StockDetail
            code={detailCode}
            quote={stockQuotes.get(detailCode)}
            theme={theme}
            onToggleTheme={toggleTheme}
            onShowSidebar={handleShowSidebar}
          />
        )
      ) : (
        <main className="detail">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <div className="detail-placeholder">
            <div className="big">📈</div>
            <div>
              {isFuturesTab
                ? '在左侧搜索并添加期货品种，点击查看详情'
                : '在左侧搜索并添加自选股，点击查看详情'}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
