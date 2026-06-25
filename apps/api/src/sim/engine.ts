// Motor de simulação de preço (server-authoritative) — ver SPEC §6.
// Funções puras e determinísticas: o gerador de ruído é injetável (seedável) para testes.

export interface EngineConfig {
  /** Drift por tick. */
  mu: number;
  /** Volatilidade por tick. */
  sigma: number;
  /** Passo de tempo (1 = parâmetros já expressos por tick). */
  dt: number;
}

/** PRNG determinístico (mulberry32). Mesma seed -> mesma sequência. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Amostra de uma normal padrão N(0,1) via Box-Muller, usando um PRNG injetado. */
export function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Próximo preço via Movimento Browniano Geométrico (GBM) discreto.
 * S(t+1) = S(t) * exp( (mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*z )
 * Sempre retorna preço > 0 para qualquer z finito.
 */
export function nextPrice(current: number, cfg: EngineConfig, z: number): number {
  const drift = (cfg.mu - 0.5 * cfg.sigma ** 2) * cfg.dt;
  const diffusion = cfg.sigma * Math.sqrt(cfg.dt) * z;
  return current * Math.exp(drift + diffusion);
}

/** Deriva uma seed inteira estável a partir do símbolo do ativo. */
export function seedFromSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (Math.imul(31, h) + symbol.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
