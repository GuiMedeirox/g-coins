import type {
  AssetDTO,
  AuthResponse,
  MeResponse,
  OpenPositionRequest,
  PositionDTO,
  ResetResponse,
} from '@g-coins/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export const wsUrl = (token?: string): string =>
  `${API_URL.replace(/^http/, 'ws')}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

async function request<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  register: (email: string, password: string) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => request<MeResponse>('/me', {}, token),
  assets: () => request<AssetDTO[]>('/assets'),
  positions: (token: string, status?: 'OPEN' | 'CLOSED') =>
    request<PositionDTO[]>(`/positions${status ? `?status=${status}` : ''}`, {}, token),
  open: (token: string, body: OpenPositionRequest) =>
    request<PositionDTO>('/positions', { method: 'POST', body: JSON.stringify(body) }, token),
  close: (token: string, id: string) =>
    request<PositionDTO>(`/positions/${id}/close`, { method: 'POST' }, token),
  reset: (token: string) => request<ResetResponse>('/me/reset', { method: 'POST' }, token),
};
