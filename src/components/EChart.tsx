import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface Props {
  option: EChartsOption;
  onDataZoom?: (range: { start: number; end: number }) => void;
}

/** ECharts 轻封装：初始化、更新 option、随容器尺寸自适应 */
export default function EChart({ option, onDataZoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const optionUpdatedAtRef = useRef(0);
  const userInteractedAtRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current!;
    const chart = echarts.init(el);
    chartRef.current = chart;

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    const markUserInteraction = () => {
      userInteractedAtRef.current = Date.now();
    };
    el.addEventListener('pointerdown', markUserInteraction);
    el.addEventListener('wheel', markUserInteraction, { passive: true });
    el.addEventListener('touchstart', markUserInteraction, { passive: true });

    return () => {
      el.removeEventListener('pointerdown', markUserInteraction);
      el.removeEventListener('wheel', markUserInteraction);
      el.removeEventListener('touchstart', markUserInteraction);
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    optionUpdatedAtRef.current = Date.now();
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onDataZoom) return;

    const handler = (event: unknown) => {
      if (Date.now() - optionUpdatedAtRef.current < 600) return;
      if (Date.now() - userInteractedAtRef.current > 2000) return;

      const payload = event as {
        start?: number;
        end?: number;
        batch?: { start?: number; end?: number }[];
      };
      const range = payload.batch?.[0] ?? payload;
      if (typeof range.start === 'number' && typeof range.end === 'number') {
        onDataZoom({ start: range.start, end: range.end });
      }
    };

    chart.on('dataZoom', handler);
    return () => {
      chart.off('dataZoom', handler);
    };
  }, [onDataZoom]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
