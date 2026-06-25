import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

// Velas construídas no cliente a partir do stream de ticks, para um gráfico vivo
// estilo corretora. Cada vela agrega os ticks de uma janela curta (BUCKET_MS).
const BUCKET_MS = 2000;

export function Chart({ symbol, price }: { symbol: string; price: number | undefined }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const currentRef = useRef<CandlestickData | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#7d8a99',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(27, 37, 48, 0.5)' },
        horzLines: { color: 'rgba(27, 37, 48, 0.5)' },
      },
      rightPriceScale: { borderColor: '#1b2530' },
      timeScale: {
        borderColor: '#1b2530',
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 6,
        barSpacing: 9,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3a4856', labelBackgroundColor: '#1b2530' },
        horzLine: { color: '#3a4856', labelBackgroundColor: '#1b2530' },
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#1fd286',
      downColor: '#f6465d',
      wickUpColor: '#1fd286',
      wickDownColor: '#f6465d',
      borderVisible: false,
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Troca de ativo: zera o gráfico.
  useEffect(() => {
    currentRef.current = null;
    seriesRef.current?.setData([]);
  }, [symbol]);

  // Novo preço: atualiza a vela em formação ou abre uma nova.
  useEffect(() => {
    const series = seriesRef.current;
    if (price === undefined || !series) return;

    const bucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const time = (bucket / 1000) as UTCTimestamp;
    const cur = currentRef.current;

    if (!cur || cur.time !== time) {
      const candle: CandlestickData = { time, open: price, high: price, low: price, close: price };
      currentRef.current = candle;
      series.update(candle);
    } else {
      const updated: CandlestickData = {
        time,
        open: cur.open,
        high: Math.max(cur.high, price),
        low: Math.min(cur.low, price),
        close: price,
      };
      currentRef.current = updated;
      series.update(updated);
    }
  }, [price]);

  return <div ref={containerRef} className="chart-wrap" />;
}
