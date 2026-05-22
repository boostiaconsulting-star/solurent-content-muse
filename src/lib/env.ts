// En Cloudflare Workers (con nodejs_compat) los secrets/vars llegan en el
// argumento `env` del fetch handler. `process.env` existe pero es de solo
// lectura — mutarlo no surte efecto. Usamos una variable de módulo (mutable
// garantizado en JS) como fuente de verdad runtime, con fallback a process.env
// para entornos Node (dev local, tests).

let cfEnv: Record<string, unknown> = {};

export function setCfEnv(env: unknown): void {
  if (env && typeof env === "object") {
    cfEnv = env as Record<string, unknown>;
  }
}

export function readEnv(name: string): string | undefined {
  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  if (typeof fromProcess === "string" && fromProcess.length > 0) return fromProcess;
  const v = cfEnv[name];
  return typeof v === "string" ? v : undefined;
}
