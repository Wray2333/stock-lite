import { useEffect, useRef, useState } from 'react';

export interface DetailStat {
  label: string;
  full: string;
  value: string;
  cls?: string;
}

interface Props {
  stats: DetailStat[];
}

export default function StatsPanel({ stats }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const primaryStats = stats.slice(0, 4);
  const secondaryStats = stats.slice(4);

  useEffect(() => {
    if (!expanded) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    setExpanded(false);
  }, [stats]);

  return (
    <div className="stats-panel" ref={panelRef}>
      <div className="stats-grid">
        {primaryStats.map((s) => (
          <div key={s.full} className="stat-cell" title={s.full}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.cls ?? ''}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {secondaryStats.length > 0 && (
        <div className="stats-more">
          <button
            type="button"
            className={`stats-more-button${expanded ? ' active' : ''}`}
            aria-label={expanded ? '收起更多指标' : '查看更多指标'}
            title={expanded ? '收起更多指标' : '查看更多指标'}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <span className="stats-close-icon" aria-hidden="true">
                ×
              </span>
            ) : (
              <span className="stats-more-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            )}
          </button>
          {expanded && (
            <div className="stats-popover">
              {secondaryStats.map((s) => (
                <div key={s.full} className="stat-cell stat-cell-secondary" title={s.full}>
                  <div className="stat-label">{s.full}</div>
                  <div className={`stat-value ${s.cls ?? ''}`}>{s.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
