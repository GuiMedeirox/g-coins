import type { User, Wallet } from '@prisma/client';
import type { UserDTO, WalletDTO } from '@g-coins/shared';

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
