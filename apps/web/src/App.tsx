import { useEffect, useState } from 'react';
import type { HealthResponse } from '@g-coins/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

type Status = { state: 'loading' } | { state: 'ok'; data: HealthResponse } | { state: 'error' };

export function App() {
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((data) => setStatus({ state: 'ok', data }))
      .catch(() => setStatus({ state: 'error' }));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>G Coins</h1>
      <p>Simulador educacional de mercado — moeda fictícia, preços simulados no servidor.</p>
      <section
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: 8,
        }}
      >
        <strong>API status:</strong>{' '}
        {status.state === 'loading' && 'verificando…'}
        {status.state === 'error' && '❌ offline (rode `pnpm dev` e o Postgres)'}
        {status.state === 'ok' && `✅ ${status.data.service} @ ${status.data.ts}`}
      </section>
    </main>
  );
}
