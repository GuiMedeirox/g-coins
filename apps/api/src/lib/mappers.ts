import type { Position, User, Wallet } from '@prisma/client';
import type { PositionDTO, UserDTO, WalletDTO } from '@g-coins/shared';

export const toUserDTO = (u: User): UserDTO => ({
  id: u.id,
  email: u.email,
  createdAt: u.createdAt.toISOString(),
});

// Valores monetários como string para preservar a precisão decimal (ver CLAUDE.md / SPEC §5).
export const toWalletDTO = (w: Wallet): WalletDTO => ({
  balance: w.balance.toString(),
  reserved: w.reserved.toString(),
});

export const toPositionDTO = (p: Position): PositionDTO => ({
  id: p.id,
  assetId: p.assetId,
  side: p.side,
  status: p.status,
  size: p.size.toString(),
  entryPrice: p.entryPrice.toString(),
  exitPrice: p.exitPrice ? p.exitPrice.toString() : null,
  pnl: p.pnl ? p.pnl.toString() : null,
  openedAt: p.openedAt.toISOString(),
  closedAt: p.closedAt ? p.closedAt.toISOString() : null,
});
