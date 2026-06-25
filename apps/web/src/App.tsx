import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type {
  AssetDTO,
  ClientMessage,
  PositionDTO,
  ServerMessage,
  Side,
  WalletDTO,
} from '@g-coins/shared';
import { api, wsUrl } from './api';

export function App() {
  const [token, setToken] = useState<string | null>(null);

  if (!token) return <Login onAuth={setToken} />;
  return <Dashboard token={token} onLogout={() => setToken(null)} />;
}

function Login({ onAuth }: { onAuth: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (mode: 'login' | 'register') => {
    setBusy(true);
    setError(null);
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      onAuth(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ ...page, maxWidth: 380 }}>
      <h1 style={{ marginBottom: 4 }}>G Coins 🪙</h1>
      <p style={{ color: muted, marginTop: 0 }}>Entre para operar com moeda fictícia.</p>
      <input style={input} placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        style={input}
        type="password"
        placeholder="senha (mín. 6)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={btnPrimary} disabled={busy} onClick={() => submit('login')}>
          Entrar
        </button>
        <button style={btn} disabled={busy} onClick={() => submit('register')}>
          Criar conta
        </button>
      </div>
      {error && <p style={{ color: red }}>{error}</p>}
    </main>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [wallet, setWallet] = useState<WalletDTO | null>(null);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [positions, setPositions] = useState<PositionDTO[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [unrealized, setUnrealized] = useState<Record<string, number>>({});
  const [size, setSize] = useState(100);
  const [selected, setSelected] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    const [me, list] = await Promise.all([api.me(token), api.positions(token, 'OPEN')]);
    setWallet(me.wallet);
    setPositions(list);
  }, [token]);

  useEffect(() => {
    api.assets().then((a) => {
      setAssets(a);
      setPrices(Object.fromEntries(a.map((x) => [x.symbol, Number(x.currentPrice)])));
      if (a[0]) setSelected(a[0].id);
    });
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (assets.length === 0) return;
    const ws = new WebSocket(wsUrl(token));
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      const msg: ClientMessage = { type: 'subscribe', symbols: assets.map((a) => a.symbol) };
      ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === 'tick') setPrices((p) => ({ ...p, [msg.symbol]: Number(msg.price) }));
      else if (msg.type === 'pnl') {
        setUnrealized(Object.fromEntries(msg.positions.map((x) => [x.id, Number(x.unrealizedPnl)])));
      }
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [assets, token]);

  const trade = async (side: Side) => {
    if (!selected) return;
    try {
      await api.open(token, { assetId: selected, side, size });
      await refresh();
      wsRef.current?.send(JSON.stringify({ type: 'refresh-positions' } satisfies ClientMessage));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao abrir posição');
    }
  };

  const close = async (id: string) => {
    try {
      await api.close(token, id);
      await refresh();
      wsRef.current?.send(JSON.stringify({ type: 'refresh-positions' } satisfies ClientMessage));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao fechar');
    }
  };

  const symbolOf = (assetId: string) => assets.find((a) => a.id === assetId)?.symbol ?? assetId;

  return (
    <main style={page}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>G Coins 🪙</h1>
        <button style={btn} onClick={onLogout}>
          sair
        </button>
      </header>
      <div style={{ color: muted, fontSize: 14, marginBottom: 12 }}>
        WebSocket: <strong style={{ color: connected ? green : red }}>{connected ? '● ao vivo' : '○ off'}</strong>
      </div>

      {wallet && (
        <div style={card}>
          <span style={{ color: muted }}>Saldo livre</span>
          <strong style={{ fontSize: 20 }}>{Number(wallet.balance).toFixed(2)} G</strong>
          <span style={{ color: muted, marginLeft: 16 }}>Reservado</span>
          <strong>{Number(wallet.reserved).toFixed(2)} G</strong>
        </div>
      )}

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Operar</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={input} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.symbol} — {(prices[a.symbol] ?? Number(a.currentPrice)).toFixed(4)}
              </option>
            ))}
          </select>
          <input
            style={{ ...input, width: 110 }}
            type="number"
            min={1}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
          <button style={{ ...btnPrimary, background: green }} onClick={() => trade('LONG')}>
            Long ▲
          </button>
          <button style={{ ...btnPrimary, background: red }} onClick={() => trade('SHORT')}>
            Short ▼
          </button>
        </div>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Posições abertas</h3>
        {positions.length === 0 ? (
          <p style={{ color: muted }}>Nenhuma posição aberta.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: muted, fontSize: 13 }}>
                <th>Ativo</th>
                <th>Lado</th>
                <th style={{ textAlign: 'right' }}>Tam.</th>
                <th style={{ textAlign: 'right' }}>Entrada</th>
                <th style={{ textAlign: 'right' }}>P&L</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pnl = unrealized[p.id] ?? 0;
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td>{symbolOf(p.assetId)}</td>
                    <td style={{ color: p.side === 'LONG' ? green : red }}>{p.side}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.size).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.entryPrice).toFixed(4)}</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: pnl > 0 ? green : pnl < 0 ? red : muted,
                      }}
                    >
                      {pnl >= 0 ? '+' : ''}
                      {pnl.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button style={btn} onClick={() => close(p.id)}>
                        fechar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

// --- estilos inline (MVP) ---
const page: CSSProperties = { fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720, margin: '0 auto' };
const muted = '#64748b';
const green = '#15803d';
const red = '#b91c1c';
const card: CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: '1rem', margin: '12px 0' };
const input: CSSProperties = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, display: 'block', width: '100%', marginTop: 6 };
const btn: CSSProperties = { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', cursor: 'pointer' };
const btnPrimary: CSSProperties = { padding: '8px 14px', border: 'none', borderRadius: 8, background: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 600 };
