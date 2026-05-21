import { AsyncLocalStorage } from "node:async_hooks";

export type CloudflareEnv = {
  BIBLIOTECA: R2Bucket;
  CONTENIDO_PROPIO: R2Bucket;
  R2_PUBLIC_URL_BIBLIOTECA: string;
  R2_PUBLIC_URL_CONTENIDO: string;
};

const cfEnvStorage = new AsyncLocalStorage<CloudflareEnv>();

export function runWithCfEnv<T>(env: CloudflareEnv, fn: () => T): T {
  return cfEnvStorage.run(env, fn);
}

export function getCfEnv(): CloudflareEnv {
  const env = cfEnvStorage.getStore();
  if (!env) throw new Error("Cloudflare env not available outside of a Worker request context");
  return env;
}
