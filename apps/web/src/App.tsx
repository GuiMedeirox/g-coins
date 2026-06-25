import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssetDTO,
  ClientMessage,
  PositionDTO,
  ServerMessage,
  Side,
  WalletDTO,
} from '@g-coins/shared';
import { api, wsUrl } from './api';
import { Chart } from './components/Chart';

type Dir = 'up' | 'down' | 'flat';
const fmt = (n: number, d = 2) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function App() {
  const [token, setToken] = useState<string | null>(null);
  if (!token) return <Login onAuth={setToken} />;
  return <Terminal token={token} onLogout={() => setToken(null)} />;
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
      const res =
        mode === 'login' ? await api.login(email, password) : await api.register(email, password);
      onAuth(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="panel login">
        <div className="brand">
          <span className="coin">G</span> G&nbsp;COINS
        </div>
        <p>Trading desk de simulação. Opere com moeda fictícia, sem risco.</p>
        <input className="input" placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className="input"
          type="password"
          placeholder="senha (mín. 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="row">
          <button className="btn-primary" disabled={busy} onClick={() => submit('login')}>
            Entrar
          </button>
          <button className="btn-ghost" disabled={busy} onClick={() => submit('register')}>
            Criar conta
          </button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}

function Terminal({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [wallet, setWallet] = useState<WalletDTO | null>(null);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [positions, setPositions] = useState<PositionDTO[]>([]);
  const [history, setHistory] = useState<PositionDTO[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [dirs, setDirs] = useState<Record<string, Dir>>({});
  const [unrealized, setUnrealized] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string>('');
  const [size, setSize] = useState(100);
  const [connected, setConnected] = useState(false);
  const prevPrice = useRef<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const refresh = useCallback(async () => {
    const [me, open, closed] = await Promise.all([
      api.me(token),
      api.positions(token, 'OPEN'),
      api.positions(token, 'CLOSED'),
    ]);
    setWallet(me.wallet);
    setPositions(open);
    setHistory(closed);
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
      ws.send(JSON.stringify({ type: 'subscribe', symbols: assets.map((a) => a.symbol) } satisfies ClientMessage));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === 'tick') {
        const next = Number(msg.price);
        const before = prevPrice.current[msg.symbol];
        const dir: Dir = before === undefined || next === before ? 'flat' : next > before ? 'up' : 'down';
        prevPrice.current[msg.symbol] = next;
        setPrices((p) => ({ ...p, [msg.symbol]: next }));
        setDirs((d) => ({ ...d, [msg.symbol]: dir }));
      } else if (msg.type === 'pnl') {
        setUnrealized(Object.fromEntries(msg.positions.map((x) => [x.id, Number(x.unrealizedPnl)])));
      }
    };
    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, [assets, token]);

  const selectedAsset = assets.find((a) => a.id === selected);
  const selSymbol = selectedAsset?.symbol ?? '';
  const selPrice = prices[selSymbol];
  const selDir = dirs[selSymbol] ?? 'flat';
  const symbolOf = (id: string) => assets.find((a) => a.id === id)?.symbol ?? id;

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

  const reset = async () => {
    if (!confirm('Resetar a carteira? Fecha as posições abertas e volta ao saldo inicial.')) return;
    try {
      await api.reset(token);
      await refresh();
      wsRef.current?.send(JSON.stringify({ type: 'refresh-positions' } satisfies ClientMessage));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao resetar');
    }
  };

  const balance = wallet ? Number(wallet.balance) : 0;
  const reserved = wallet ? Number(wallet.reserved) : 0;
  const openPnl = positions.reduce((s, p) => s + (unrealized[p.id] ?? 0), 0);
  const equity = balance + reserved + openPnl;
  const dirColor = (d: Dir) => (d === 'up' ? 'var(--up)' : d === 'down' ? 'var(--down)' : 'var(--text)');

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="coin">G</span> G&nbsp;COINS <span className="tag">SIM</span>
        </div>
        <div className="spacer" />
        <div className="conn">
          <span className={`dot ${connected ? 'live' : ''}`} />
          {connected ? 'AO VIVO' : 'OFF'}
        </div>
        <button className="linkbtn" onClick={onLogout}>
          sair
        </button>
      </div>

      <div className="layout">
        <div className="col">
          {/* ticker strip */}
          <div className="ticker">
            {assets.map((a) => {
              const px = prices[a.symbol] ?? Number(a.currentPrice);
              const d = dirs[a.symbol] ?? 'flat';
              return (
                <button
                  key={a.id}
                  className={`chip ${a.id === selected ? 'active' : ''}`}
                  onClick={() => setSelected(a.id)}
                >
                  <div className="sym">{a.symbol}</div>
                  <div className="px" style={{ color: dirColor(d) }}>
                    {fmt(px, 4)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* chart */}
          <div className="panel chart-card">
            <div className="chart-head">
              <div>
                <div className="name">{selectedAsset?.name ?? '—'}</div>
                <div className="big mono" style={{ color: dirColor(selDir) }}>
                  {selPrice !== undefined ? fmt(selPrice, 4) : '—'}
                </div>
              </div>
              <div className="arrow" style={{ color: dirColor(selDir) }}>
                {selDir === 'up' ? '▲' : selDir === 'down' ? '▼' : '—'}
              </div>
            </div>
            <Chart symbol={selSymbol} price={selPrice} />
          </div>

          {/* open positions */}
          <div className="panel panel-pad">
            <h3>Posições abertas</h3>
            {positions.length === 0 ? (
              <div className="empty">Nenhuma posição aberta. Abra um Long ou Short ao lado.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Lado</th>
                    <th className="num">Tam.</th>
                    <th className="num">Entrada</th>
                    <th className="num">P&L</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const pnl = unrealized[p.id] ?? 0;
                    return (
                      <tr key={p.id}>
                        <td className="mono">{symbolOf(p.assetId)}</td>
                        <td>
                          <span className={`pill ${p.side === 'LONG' ? 'long' : 'short'}`}>{p.side}</span>
                        </td>
                        <td className="num">{fmt(Number(p.size))}</td>
                        <td className="num">{fmt(Number(p.entryPrice), 4)}</td>
                        <td className="num" style={{ color: pnl > 0 ? 'var(--up)' : pnl < 0 ? 'var(--down)' : 'var(--muted)' }}>
                          {pnl >= 0 ? '+' : ''}
                          {fmt(pnl)}
                        </td>
                        <td className="num">
                          <button className="linkbtn" onClick={() => close(p.id)}>
                            fechar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* history */}
          <div className="panel panel-pad">
            <h3>Histórico</h3>
            {history.length === 0 ? (
              <div className="empty">Sem trades fechados ainda.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Lado</th>
                    <th className="num">Tam.</th>
                    <th className="num">Entrada</th>
                    <th className="num">Saída</th>
                    <th className="num">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 15).map((p) => {
                    const pnl = Number(p.pnl ?? 0);
                    return (
                      <tr key={p.id}>
                        <td className="mono">{symbolOf(p.assetId)}</td>
                        <td>
                          <span className={`pill ${p.side === 'LONG' ? 'long' : 'short'}`}>{p.side}</span>
                        </td>
                        <td className="num">{fmt(Number(p.size))}</td>
                        <td className="num">{fmt(Number(p.entryPrice), 4)}</td>
                        <td className="num">{p.exitPrice ? fmt(Number(p.exitPrice), 4) : '—'}</td>
                        <td className="num" style={{ color: pnl > 0 ? 'var(--up)' : pnl < 0 ? 'var(--down)' : 'var(--muted)' }}>
                          {pnl >= 0 ? '+' : ''}
                          {fmt(pnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* sidebar */}
        <div className="col">
          <div className="panel panel-pad">
            <h3>Carteira</h3>
            <div className="wallet-grid">
              <div className="stat">
                <div className="k">Saldo livre</div>
                <div className="v">{fmt(balance)}</div>
              </div>
              <div className="stat">
                <div className="k">Em ordens</div>
                <div className="v">{fmt(reserved)}</div>
              </div>
              <div className="stat full">
                <div className="k">Patrimônio · P&L aberto</div>
                <div className="v">
                  {fmt(equity)} G{' '}
                  <span style={{ fontSize: 14, color: openPnl > 0 ? 'var(--up)' : openPnl < 0 ? 'var(--down)' : 'var(--muted)' }}>
                    ({openPnl >= 0 ? '+' : ''}
                    {fmt(openPnl)})
                  </span>
                </div>
              </div>
            </div>
            <button className="linkbtn" style={{ marginTop: 14 }} onClick={reset}>
              resetar carteira
            </button>
          </div>

          <div className="panel panel-pad">
            <h3>Operar</h3>
            <div className="field-label">Ativo</div>
            <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} · {fmt(prices[a.symbol] ?? Number(a.currentPrice), 4)}
                </option>
              ))}
            </select>

            <div className="field-label" style={{ marginTop: 14 }}>
              Tamanho (G Coins)
            </div>
            <input
              className="input"
              type="number"
              min={1}
              value={size}
              onChange={(e) => setSize(Math.max(1, Number(e.target.value)))}
            />
            <div className="quick">
              <button onClick={() => setSize((s) => s + 50)}>+50</button>
              <button onClick={() => setSize((s) => s + 100)}>+100</button>
              <button onClick={() => setSize((s) => s + 500)}>+500</button>
              <button onClick={() => setSize(Math.floor(balance) || 1)}>máx</button>
            </div>

            <div className="trade-actions">
              <button className="tbtn long" onClick={() => trade('LONG')}>
                LONG ▲
              </button>
              <button className="tbtn short" onClick={() => trade('SHORT')}>
                SHORT ▼
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
