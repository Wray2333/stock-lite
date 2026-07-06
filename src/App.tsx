import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import Watchlist, { type SidebarTab } from './components/Watchlist';
import StockDetail from './components/StockDetail';
import MetalDetail from './components/MetalDetail';
import ThemeToggle from './components/ThemeToggle';
import {
  fetchMetalQuotes,
  fetchQuotes,
  isMetalCode,
  type AppQuote,
  type MetalQuote,
} from './sdk';
import {
  DEFAULT_METALS,
  DEFAULT_WATCHLIST,
  loadStorage,
  saveMetals,
  saveTheme,
  saveWatchlist,
  type WatchItem,
} from './storage';
import type { Theme } from './theme';

const QUOTE_REFRESH_MS = 5000;
const METAL_REFRESH_MS = 15000;
function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadTheme(): Theme {
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
  const [theme, setTheme] = useState<Theme>(() => loadTheme());

  const [watchlist, setWatchlist] = useState<WatchItem[]>(DEFAULT_WATCHLIST);
  const [selected, setSelected] = useState<string | null>(
    () => DEFAULT_WATCHLIST[0]?.code ?? null
  );
  const [quotes, setQuotes] = useState<Map<string, AppQuote>>(new Map());

  const [metals, setMetals] = useState<WatchItem[]>(() =>
    DEFAULT_METALS.filter((m) => isMetalCode(m.code))
  );
  const [selectedMetal, setSelectedMetal] = useState<string | null>(
    () => DEFAULT_METALS.filter((m) => isMetalCode(m.code))[0]?.code ?? null
  );
  const [metalQuotes, setMetalQuotes] = useState<Map<string, MetalQuote>>(new Map());

  useEffect(() => {
    let cancelled = false;
    loadStorage()
      .then((data) => {
        if (cancelled) return;
        const fileMetals = data.metals.filter((m) => isMetalCode(m.code));
        setWatchlist(data.watchlist);
        if (data.theme) {
          applyTheme(data.theme);
          setTheme(data.theme);
        }
        setSelected((current) =>
          current && data.watchlist.some((w) => w.code === current)
            ? current
            : data.watchlist[0]?.code ?? null
        );
        setMetals(fileMetals);
        setSelectedMetal((current) =>
          current && fileMetals.some((m) => m.code === current)
            ? current
            : fileMetals[0]?.code ?? null
        );
      })
      .catch(() => {
        // 文件存储不可用时保留默认列表，避免页面空白。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 股票行情轮询：自选列表 + 当前选中（仅自选 tab 激活时）
  useEffect(() => {
    if (activeTab !== 'stock') return;
    const codes = [...new Set([...watchlist.map((w) => w.code), selected].filter(Boolean))] as string[];
    if (codes.length === 0) return;

    let cancelled = false;
    const load = async () => {
      try {
        const map = await fetchQuotes(codes);
        if (!cancelled && map.size > 0) {
          setQuotes((prev) => {
            const next = new Map(prev);
            for (const [k, v] of map) next.set(k, v);
            return next;
          });
        }
      } catch {
        // 行情拉取失败时保留上一次数据，等待下轮刷新
      }
    };
    load();
    const timer = setInterval(load, QUOTE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTab, watchlist, selected]);

  // 金属行情轮询：全球期货接口是全量列表，刷新间隔放宽（仅金属 tab 激活时）
  useEffect(() => {
    if (activeTab !== 'metal') return;
    const codes = [...new Set([...metals.map((m) => m.code), selectedMetal].filter(Boolean))] as string[];
    if (codes.length === 0) return;

    let cancelled = false;
    const load = async () => {
      try {
        const map = await fetchMetalQuotes(codes);
        if (!cancelled && map.size > 0) {
          setMetalQuotes((prev) => {
            const next = new Map(prev);
            for (const [k, v] of map) next.set(k, v);
            return next;
          });
        }
      } catch {
        // 失败保留旧数据
      }
    };
    load();
    const timer = setInterval(load, METAL_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTab, metals, selectedMetal]);

  const handleAdd = useCallback((item: WatchItem) => {
    setWatchlist((prev) => {
      if (prev.some((w) => w.code === item.code)) return prev;
      const next = [...prev, item];
      void saveWatchlist(next);
      return next;
    });
  }, []);

  const handleRemove = useCallback(
    (code: string) => {
      setWatchlist((prev) => {
        const next = prev.filter((w) => w.code !== code);
        void saveWatchlist(next);
        if (selected === code) {
          setSelected(next[0]?.code ?? null);
        }
        return next;
      });
    },
    [selected]
  );

  const handleAddMetal = useCallback((item: WatchItem) => {
    setMetals((prev) => {
      if (prev.some((m) => m.code === item.code)) return prev;
      const next = [...prev, item];
      void saveMetals(next);
      return next;
    });
  }, []);

  const handleRemoveMetal = useCallback(
    (code: string) => {
      setMetals((prev) => {
        const next = prev.filter((m) => m.code !== code);
        void saveMetals(next);
        if (selectedMetal === code) {
          setSelectedMetal(next[0]?.code ?? null);
        }
        return next;
      });
    },
    [selectedMetal]
  );

  const isMetalTab = activeTab === 'metal';
  const detailCode = isMetalTab ? selectedMetal : selected;

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
    setSelected(code);
    setMobileSidebarOpen(false);
  }, []);

  const handleSelectMetal = useCallback((code: string) => {
    setSelectedMetal(code);
    setMobileSidebarOpen(false);
  }, []);

  return (
    <div className={`app${mobileSidebarOpen ? ' mobile-sidebar-open' : ''}`}>
      <button
        type="button"
        className="mobile-watchlist-toggle"
        onClick={() => setMobileSidebarOpen(true)}
      >
        {isMetalTab ? '金属' : '自选'}
      </button>
      <button
        type="button"
        className="mobile-sidebar-backdrop"
        aria-label="关闭列表"
        onClick={() => setMobileSidebarOpen(false)}
      />
      <div className="sidebar-shell">
        <Watchlist
          activeTab={activeTab}
          onTabChange={setActiveTab}
          watchlist={watchlist}
          quotes={quotes}
          selected={selected}
          onSelect={handleSelectStock}
          onAdd={handleAdd}
          onRemove={handleRemove}
          metals={metals}
          metalQuotes={metalQuotes}
          selectedMetal={selectedMetal}
          onSelectMetal={handleSelectMetal}
          onAddMetal={handleAddMetal}
          onRemoveMetal={handleRemoveMetal}
        />
      </div>
      {detailCode ? (
        isMetalTab ? (
          <MetalDetail
            code={detailCode}
            name={metals.find((m) => m.code === detailCode)?.name}
            quote={metalQuotes.get(detailCode)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <StockDetail
            code={detailCode}
            quote={quotes.get(detailCode)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )
      ) : (
        <main className="detail">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <div className="detail-placeholder">
            <div className="big">📈</div>
            <div>
              {isMetalTab
                ? '在左侧搜索并添加金属品种，点击查看详情'
                : '在左侧搜索并添加自选股，点击查看详情'}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
