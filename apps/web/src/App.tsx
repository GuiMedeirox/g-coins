import { useEffect, useRef, useState } from 'react';
import type { AssetDTO, ClientMessage, ServerMessage } from '@g-coins/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';
const WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws`;

type Dir = 'up' | 'down' | 'flat';

export function App() {
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [dirs, setDirs] = useState<Record<string, Dir>>({});
  const [connected, setConnected] = useState(false);
  const prev = useRef<Record<string, number>>({});

  // Carrega a lista de ativos (US-2).
  useEffect(() => {
    fetch(`${API_URL}/assets`)
      .then((r) => r.json() as Promise<AssetDTO[]>)
      .then((data) => {
        setAssets(data);
        setPrices(Object.fromEntries(data.map((a) => [a.symbol, a.currentPrice])));
      })
      .catch(() => setAssets([]));
  }, []);

  // Conecta ao WebSocket e assina os símbolos; atualiza preço ao vivo (US-2).
  useEffect(() => {
    if (assets.length === 0) return;
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
      const msg: ClientMessage = { type: 'subscribe', symbols: assets.map((a) => a.symbol) };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type !== 'tick') return;
      const next = Number(msg.price);
      const before = prev.current[msg.symbol];
      const dir: Dir = before === undefined || next === before ? 'flat' : next > before ? 'up' : 'down';
      prev.current[msg.symbol] = next;
      setPrices((p) => ({ ...p, [msg.symbol]: msg.price }));
      setDirs((d) => ({ ...d, [msg.symbol]: dir }));
    };

    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [assets]);

  const color = (d: Dir | undefined) => (d === 'up' ? '#15803d' : d === 'down' ? '#b91c1c' : '#334155');
  const arrow = (d: Dir | undefined) => (d === 'up' ? '▲' : d === 'down' ? '▼' : '–');

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1 style={{ marginBottom: 0 }}>G Coins 🪙</h1>
      <p style={{ color: '#64748b', marginTop: 4 }}>
        Simulador educacional de mercado — preços simulados no servidor, ao vivo.
      </p>

      <div style={{ margin: '0.75rem 0', fontSize: 14 }}>
        WebSocket:{' '}
        <strong style={{ color: connected ? '#15803d' : '#b91c1c' }}>
          {connected ? '● conectado' : '○ desconectado'}
        </strong>
      </div>

      {assets.length === 0 ? (
        <p style={{ color: '#b91c1c' }}>
          Sem ativos. Rode a API (`pnpm dev`), o Postgres e o seed (`pnpm --filter @g-coins/api db:seed`).
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '8px 4px' }}>Ativo</th>
              <th style={{ padding: '8px 4px' }}>Símbolo</th>
              <th style={{ padding: '8px 4px', textAlign: 'right' }}>Preço</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 4px' }}>{a.name}</td>
                <td style={{ padding: '8px 4px', color: '#64748b' }}>{a.symbol}</td>
                <td
                  style={{
                    padding: '8px 4px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    color: color(dirs[a.symbol]),
                  }}
                >
                  {arrow(dirs[a.symbol])} {Number(prices[a.symbol] ?? a.currentPrice).toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
