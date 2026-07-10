import { useEffect, useRef, useState } from 'react';
import {
  searchMetals,
  searchStocks,
  type AppQuote,
  type MetalQuote,
  type MetalSearchItem,
  type StockSearchItem,
} from '../sdk';
import type { WatchItem } from '../storage';
import {
  exchangeInfo,
  fmtCode,
  fmtPercent,
  fmtPriceCur,
  metalExchangeInfo,
  trendClass,
} from '../format';

export type SidebarTab = 'stock' | 'metal';

interface Props {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  watchlist: WatchItem[];
  quotes: Map<string, AppQuote>;
  selected: string | null;
  onSelect: (code: string) => void;
  onAdd: (item: WatchItem) => void;
  onRemove: (code: string) => void;
  metals: WatchItem[];
  metalQuotes: Map<string, MetalQuote>;
  selectedMetal: string | null;
  onSelectMetal: (code: string) => void;
  onAddMetal: (item: WatchItem) => void;
  onRemoveMetal: (code: string) => void;
}

export default function Watchlist({
  activeTab,
  onTabChange,
  watchlist,
  quotes,
  selected,
  onSelect,
  onAdd,
  onRemove,
  metals,
  metalQuotes,
  selectedMetal,
  onSelectMetal,
  onAddMetal,
  onRemoveMetal,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [stockResults, setStockResults] = useState<StockSearchItem[] | null>(null);
  const [metalResults, setMetalResults] = useState<MetalSearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isMetalTab = activeTab === 'metal';

  // 切换 tab 时清空搜索
  useEffect(() => {
    setKeyword('');
    setStockResults(null);
    setMetalResults(null);
  }, [activeTab]);

  // 防抖搜索：股票 / 期货按当前 tab 分流
  useEffect(() => {
    const kw = keyword.trim();
    if (!kw) {
      setStockResults(null);
      setMetalResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (isMetalTab) {
          const list = await searchMetals(kw);
          if (!cancelled) setMetalResults(list);
        } else {
          const list = await searchStocks(kw);
          if (!cancelled) setStockResults(list);
        }
      } catch {
        if (!cancelled) {
          if (isMetalTab) setMetalResults([]);
          else setStockResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [keyword, isMetalTab]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setKeyword('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const watchedCodes = new Set(watchlist.map((w) => w.code));
  const metalCodes = new Set(metals.map((m) => m.code));

  const handlePickStock = (item: StockSearchItem) => {
    if (!watchedCodes.has(item.code)) {
      onAdd(item);
    }
    onSelect(item.code);
    setKeyword('');
  };

  const handlePickMetal = (item: MetalSearchItem) => {
    if (!metalCodes.has(item.code)) {
      onAddMetal({ code: item.code, name: item.name });
    }
    onSelectMetal(item.code);
    setKeyword('');
  };

  const results = isMetalTab ? metalResults : stockResults;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab${!isMetalTab ? ' active' : ''}`}
            onClick={() => onTabChange('stock')}
          >
            自选
          </button>
          <button
            className={`sidebar-tab${isMetalTab ? ' active' : ''}`}
            onClick={() => onTabChange('metal')}
          >
            期货
          </button>
        </div>
        <div className="search-box" ref={boxRef}>
          <input
            className="search-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={
              isMetalTab ? '搜索期货品种，如 黄金 / GC' : '搜索 A股 / 美股代码、名称、拼音'
            }
          />
          {keyword.trim() && (
            <div className="search-dropdown">
              {searching ? (
                <div className="search-empty">搜索中…</div>
              ) : results && results.length > 0 ? (
                isMetalTab ? (
                  metalResults!.map((r) => {
                    const ex = metalExchangeInfo(r.name);
                    const isAdded = metalCodes.has(r.code);
                    return (
                      <div
                        key={r.code}
                        className={`search-item${isAdded ? ' is-added' : ''}`}
                        onClick={() => handlePickMetal(r)}
                      >
                        <span className="name">
                          <span className="market-tag metal" title={ex.full}>
                            {ex.label}
                          </span>
                          {r.name}
                        </span>
                        <span className="search-item-meta">
                          <span className="code">{r.code}</span>
                          {isAdded && (
                            <span
                              className="search-added-status"
                              aria-label="已添加"
                              title="已添加"
                            >
                              ✓
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  stockResults!.map((r) => {
                    const ex = exchangeInfo(r.code);
                    const isAdded = watchedCodes.has(r.code);
                    return (
                      <div
                        key={r.code}
                        className={`search-item${isAdded ? ' is-added' : ''}`}
                        onClick={() => handlePickStock(r)}
                      >
                        <span className="name">
                          <span
                            className={`market-tag ${ex.market === 'US' ? 'us' : 'a'}`}
                            title={ex.full}
                          >
                            {ex.label}
                          </span>
                          {r.name}
                        </span>
                        <span className="search-item-meta">
                          <span className="code">{fmtCode(r.code)}</span>
                          {isAdded && (
                            <span
                              className="search-added-status"
                              aria-label="已添加"
                              title="已添加"
                            >
                              ✓
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })
                )
              ) : (
                <div className="search-empty">
                  {isMetalTab ? '未找到相关期货品种' : '未找到相关股票'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="watch-list">
        {isMetalTab ? (
          metals.length === 0 ? (
            <div className="watch-empty">
              期货列表为空
              <br />
              使用上方搜索框添加期货
            </div>
          ) : (
            metals.map((item) => {
              const q = metalQuotes.get(item.code);
              const cls = trendClass(q?.changePercent);
              const ex = metalExchangeInfo(q?.name ?? item.name);
              return (
                <div
                  key={item.code}
                  className={`watch-row${selectedMetal === item.code ? ' active' : ''}`}
                  onClick={() => onSelectMetal(item.code)}
                >
                  <div className="watch-info">
                    <div className="watch-name">{q?.name || item.name}</div>
                    <div className="watch-code">
                      <span className="market-tag metal" title={ex.full}>
                        {ex.label}
                      </span>
                      {item.code}
                    </div>
                  </div>
                  <div className="watch-quote">
                    <div className={`watch-price ${cls}`}>
                      {fmtPriceCur(q?.price, ex.symbol)}
                    </div>
                    <div className={`watch-percent ${cls}`}>
                      {fmtPercent(q?.changePercent)}
                    </div>
                  </div>
                  <button
                    className="watch-remove"
                    title="移除"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMetal(item.code);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )
        ) : watchlist.length === 0 ? (
          <div className="watch-empty">
            自选列表为空
            <br />
            使用上方搜索框添加股票
          </div>
        ) : (
          watchlist.map((item) => {
            const q = quotes.get(item.code);
            const cls = trendClass(q?.changePercent);
            const ex = exchangeInfo(item.code);
            return (
              <div
                key={item.code}
                className={`watch-row${selected === item.code ? ' active' : ''}`}
                onClick={() => onSelect(item.code)}
              >
                <div className="watch-info">
                  <div className="watch-name">{q?.name || item.name}</div>
                  <div className="watch-code">
                    <span
                      className={`market-tag ${ex.market === 'US' ? 'us' : 'a'}`}
                      title={ex.full}
                    >
                      {ex.label}
                    </span>
                    {fmtCode(item.code)}
                  </div>
                </div>
                <div className="watch-quote">
                  <div className={`watch-price ${cls}`}>
                    {fmtPriceCur(q?.price, ex.symbol)}
                  </div>
                  <div className={`watch-percent ${cls}`}>
                    {fmtPercent(q?.changePercent)}
                  </div>
                </div>
                <button
                  className="watch-remove"
                  title="移除自选"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.code);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
