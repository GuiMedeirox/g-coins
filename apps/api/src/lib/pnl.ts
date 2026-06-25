import { Prisma } from '@prisma/client';
import type { Side } from '@g-coins/shared';

// Cálculo de P&L (ver SPEC §7). Decimal em todo o caminho — nunca float (guardrail).
//   LONG:  pnl = size * ( price/entry - 1 )
//   SHORT: pnl = size * ( 1 - price/entry )
// Proteção de saldo (MVP): perda máxima por posição = size (clamp em pnl >= -size).
export function computePnl(
  side: Side,
  size: Prisma.Decimal,
  entry: Prisma.Decimal,
  price: Prisma.Decimal,
): Prisma.Decimal {
  const ratio = price.div(entry);
  const raw =
    side === 'LONG'
      ? size.mul(ratio.sub(1))
      : size.mul(new Prisma.Decimal(1).sub(ratio));

  const minPnl = size.neg();
  return raw.lt(minPnl) ? minPnl : raw;
}
