import { createServerFn } from "@tanstack/react-start";
import { readEnv } from "@/lib/env";

/**
 * Payload compatible con el de Make para sustitución directa.
 * Solo se publican las redes "instagram" y "facebook" vía Graph API.
 * "tiktok" y "youtube" se ignoran (requieren APIs propias).
 */
export type MetaPayload = {
  imagen_url: string | null;
  contenido_tipo: "image" | "video";
  copy: {
    facebook: string;
    instagram: string;
    tiktok: string;
    youtube: string;
  };
  redes: ("facebook" | "instagram" | "tiktok" | "youtube")[];
  fecha: string | null;
  equipo: string;
};

export type MetaResultPerNetwork = {
  network: "instagram" | "facebook" | "tiktok" | "youtube";
  ok: boolean;
  id?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

export type MetaResult = {
  ok: boolean;
  results: MetaResultPerNetwork[];
};

// Lazy getter: las env vars no están disponibles a nivel de módulo en CF Workers
// (setCfEnv todavía no se ha llamado). Resolvemos en cada uso.
const graphBase = () => `https://graph.facebook.com/${readEnv("META_GRAPH_VERSION") ?? "v21.0"}`;

async function graphFetch(path: string, init: RequestInit & { qs?: Record<string, string> } = {}) {
  const { qs, ...rest } = init;
  const url = new URL(`${graphBase()}${path}`);
  if (qs) for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), rest);
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = json?.error?.message || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function waitForIgContainer(containerId: string, token: string, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "UNKNOWN";
  while (Date.now() < deadline) {
    const data = await graphFetch(`/${containerId}`, {
      method: "GET",
      qs: { fields: "status_code,status", access_token: token },
    });
    lastStatus = data?.status_code ?? lastStatus;
    if (lastStatus === "FINISHED") return;
    if (lastStatus === "ERROR" || lastStatus === "EXPIRED") {
      throw new Error(`IG container ${lastStatus}: ${data?.status ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`IG container timeout (último estado: ${lastStatus})`);
}

async function publishInstagram(opts: {
  igUserId: string;
  token: string;
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const created = await graphFetch(`/${opts.igUserId}/media`, {
    method: "POST",
    qs: {
      image_url: opts.imageUrl,
      caption: opts.caption,
      access_token: opts.token,
    },
  });
  const containerId = created?.id;
  if (!containerId) throw new Error("IG no devolvió container id");

  await waitForIgContainer(containerId, opts.token);

  const published = await graphFetch(`/${opts.igUserId}/media_publish`, {
    method: "POST",
    qs: { creation_id: containerId, access_token: opts.token },
  });
  const mediaId = published?.id;
  if (!mediaId) throw new Error("IG no devolvió media id al publicar");
  return mediaId;
}

async function publishFacebook(opts: {
  pageId: string;
  token: string; // USER access token
  imageUrl: string;
  message: string;
}): Promise<string> {
  // FB rechaza /photos con USER token devolviendo (#200) publish_actions deprecated
  // aunque tenga pages_manage_posts. Intercambiamos el USER token por el PAGE
  // access token (ese sí permite escribir en la página).
  let publishToken = opts.token;
  try {
    const tokenData = await graphFetch(`/${opts.pageId}`, {
      method: "GET",
      qs: { fields: "access_token", access_token: opts.token },
    });
    if (typeof tokenData?.access_token === "string" && tokenData.access_token.length > 0) {
      publishToken = tokenData.access_token;
    }
  } catch {
    // si falla la derivación, intentamos con el USER token (puede que algunos
    // tokens long-lived sí funcionen directo)
  }

  const data = await graphFetch(`/${opts.pageId}/photos`, {
    method: "POST",
    qs: {
      url: opts.imageUrl,
      message: opts.message,
      published: "true",
      access_token: publishToken,
    },
  });
  const id = data?.post_id || data?.id;
  if (!id) throw new Error("FB no devolvió id");
  return id;
}

/**
 * Construye el MetaPayload desde el copy crudo. Reutilizable desde las rutas
 * para no duplicar normalización (keys de red, filtrado a redes Meta).
 */
const REDES_KEYS = ["facebook", "instagram", "tiktok", "youtube"] as const;
type RedKey = (typeof REDES_KEYS)[number];

function redKey(name: string): RedKey | null {
  const n = name.toLowerCase();
  if (n.includes("face")) return "facebook";
  if (n.includes("insta")) return "instagram";
  if (n.includes("tik")) return "tiktok";
  if (n.includes("you")) return "youtube";
  return null;
}

export function buildMetaPayload(input: {
  imagen_url: string | null;
  contenido_tipo: "image" | "video";
  copyRaw: Record<string, string>;
  redesRaw: string[];
  fecha: string | null;
  equipo: string;
}): MetaPayload {
  const copy: MetaPayload["copy"] = { facebook: "", instagram: "", tiktok: "", youtube: "" };
  for (const [k, v] of Object.entries(input.copyRaw ?? {})) {
    const rk = redKey(k);
    if (rk) copy[rk] = v ?? "";
  }
  const redes = Array.from(
    new Set(
      (input.redesRaw ?? [])
        .map((r) => redKey(r))
        .filter((r): r is RedKey => !!r),
    ),
  );
  return {
    imagen_url: input.imagen_url,
    contenido_tipo: input.contenido_tipo,
    copy,
    redes,
    fecha: input.fecha,
    equipo: input.equipo,
  };
}

/**
 * Núcleo de publicación a Meta — reusable desde server fn (HTTP) y cron.
 * Lee credenciales con readEnv. Lanza si falta el token o el payload es inválido.
 */
export async function publishMetaPayload(data: MetaPayload): Promise<MetaResult> {
    const token = readEnv("META_ACCESS_TOKEN") ?? readEnv("META_TOKEN");
    const igUserId = readEnv("META_IG_USER_ID");
    const pageId = readEnv("META_FB_PAGE_ID");
    if (!token) throw new Error("META_ACCESS_TOKEN no configurado");

    const results: MetaResultPerNetwork[] = [];
    const wantsIG = data.redes.includes("instagram");
    const wantsFB = data.redes.includes("facebook");

    if (data.contenido_tipo !== "image") {
      throw new Error("Publicación directa a Meta solo soporta imagen en este paso");
    }
    if (!data.imagen_url) {
      throw new Error("Falta imagen_url para publicar en Meta");
    }

    // Instagram
    if (wantsIG) {
      if (!igUserId) {
        results.push({ network: "instagram", ok: false, error: "META_IG_USER_ID no configurado" });
      } else {
        try {
          const id = await publishInstagram({
            igUserId,
            token,
            imageUrl: data.imagen_url,
            caption: data.copy.instagram || "",
          });
          results.push({ network: "instagram", ok: true, id });
        } catch (e) {
          results.push({ network: "instagram", ok: false, error: (e as Error).message });
        }
      }
    }

    // Facebook
    if (wantsFB) {
      if (!pageId) {
        results.push({ network: "facebook", ok: false, error: "META_FB_PAGE_ID no configurado" });
      } else {
        try {
          const id = await publishFacebook({
            pageId,
            token,
            imageUrl: data.imagen_url,
            message: data.copy.facebook || "",
          });
          results.push({ network: "facebook", ok: true, id });
        } catch (e) {
          results.push({ network: "facebook", ok: false, error: (e as Error).message });
        }
      }
    }

    // Redes no Meta: TikTok / YouTube → quedan fuera del alcance de este paso.
    for (const r of data.redes) {
      if (r === "tiktok" || r === "youtube") {
        results.push({
          network: r,
          ok: false,
          skipped: true,
          reason: `Publicación a ${r} no soportada vía Meta Graph API`,
        });
      }
    }

    const anyAttempted = results.some((r) => !r.skipped);
    const anyFailed = results.some((r) => !r.ok && !r.skipped);
    return { ok: anyAttempted && !anyFailed, results };
}

export const publishToMeta = createServerFn({ method: "POST" })
  .inputValidator((d: MetaPayload) => d)
  .handler(async ({ data }): Promise<MetaResult> => publishMetaPayload(data));
