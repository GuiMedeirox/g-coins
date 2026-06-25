// Contrato compartilhado entre api e web — fonte única (ver CLAUDE.md, guardrail "contrato único").
// Valores monetários trafegam como string para preservar precisão decimal (ver SPEC §5).

export const Side = {
  LONG: 'LONG',
  SHORT: 'SHORT',
} as const;
export type Side = (typeof Side)[keyof typeof Side];

export const PositionStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type PositionStatus = (typeof PositionStatus)[keyof typeof PositionStatus];

/** Saldo inicial concedido a cada nova carteira (G Coins). Ver SPEC §3 / US-1. */
export const INITIAL_BALANCE = 10_000;

// --- DTOs (REST) ---

export interface UserDTO {
  id: string;
  email: string;
  createdAt: string;
}

export interface WalletDTO {
  /** G Coins livres. */
  balance: string;
  /** G Coins travados em posições abertas. */
  reserved: string;
}

export interface AssetDTO {
  id: string;
  symbol: string;
  name: string;
  currentPrice: string;
  isActive: boolean;
}

export interface CandleDTO {
  openTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface PositionDTO {
  id: string;
  assetId: string;
  side: Side;
  status: PositionStatus;
  size: string;
  entryPrice: string;
  exitPrice: string | null;
  pnl: string | null;
  openedAt: string;
  closedAt: string | null;
}

// --- Auth (REST, ver SPEC §8 / US-1) ---

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface MeResponse {
  user: UserDTO;
  wallet: WalletDTO;
}

// --- Mensagens WebSocket (ver SPEC §8) ---

export type ClientMessage =
  | { type: 'subscribe'; symbols: string[] }
  | { type: 'unsubscribe'; symbols: string[] };

export type ServerMessage =
  | { type: 'tick'; symbol: string; price: string; ts: string }
  | { type: 'candle'; symbol: string; candle: CandleDTO }
  | { type: 'pnl'; positions: Array<{ id: string; unrealizedPnl: string }> };

// --- Health ---

export interface HealthResponse {
  status: 'ok';
  service: string;
  ts: string;
}

// --- Erros padronizados (ver SPEC §8) ---

export const ErrorCode = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  POSITION_CLOSED: 'POSITION_CLOSED',
  ASSET_INACTIVE: 'ASSET_INACTIVE',
  INVALID_SIZE: 'INVALID_SIZE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiError {
  error: {
    code: ErrorCode | string;
    message: string;
  };
}
