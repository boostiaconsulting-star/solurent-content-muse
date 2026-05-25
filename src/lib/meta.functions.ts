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
  const method = (rest.method ?? "GET").toUpperCase();
  const url = new URL(`${graphBase()}${path}`);
  if (qs) for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), rest);
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const err = json?.error ?? {};
    const msg = err.message || text || `HTTP ${res.status}`;
    const detail = `code=${err.code ?? "?"} subcode=${err.error_subcode ?? "?"} type=${err.type ?? "?"} fbtrace=${err.fbtrace_id ?? "?"}`;
    console.warn(`[meta] graphFetch FAILED ${method} ${path} status=${res.status} ${detail} message="${msg}"`);
    throw new Error(`${msg} (${detail})`);
  }
  return json;
}

/**
 * Polling del status del IG media container. Recibe el USER access token
 * (NO el Page token derivado): el endpoint GET /{containerId} responde
 * code=100/subcode=33 cuando se le pasa el Page token aunque el POST /media
 * sí acepte ese mismo Page token. Misma observación documentada por varios
 * desarrolladores en la comunidad de Meta — el endpoint del container es el
 * único de la cadena IG content publish que requiere el token original.
 */
async function waitForIgContainer(containerId: string, userToken: string, timeoutMs = 25_000) {
  console.log(`[meta] waitForIgContainer poll start containerId=${containerId} userTokenFp=${tokenFp(userToken)} timeoutMs=${timeoutMs}`);
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "UNKNOWN";
  while (Date.now() < deadline) {
    const data = await graphFetch(`/${containerId}`, {
      method: "GET",
      qs: { fields: "status_code,status", access_token: userToken },
    });
    lastStatus = data?.status_code ?? lastStatus;
    if (lastStatus === "FINISHED") {
      console.log(`[meta] waitForIgContainer poll FINISHED containerId=${containerId}`);
      return;
    }
    if (lastStatus === "ERROR" || lastStatus === "EXPIRED") {
      throw new Error(`IG container ${lastStatus}: ${data?.status ?? ""}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`IG container timeout (último estado: ${lastStatus})`);
}

async function publishInstagram(opts: {
  igUserId: string;
  pageId: string;
  token: string; // USER access token — se intercambia internamente por PAGE token
  imageUrl: string;
  caption: string;
}): Promise<string> {
  // IG content publish API rechaza el USER token con (#10) Application does not
  // have permission for this action. Se necesita el PAGE access token de la
  // página FB que posee la cuenta IG.
  const igToken = await getPageAccessToken(opts.pageId, opts.token);
  console.log(`[meta] publishInstagram IMAGE start igUserId=${opts.igUserId} igTokenFp=${tokenFp(igToken)} imageUrl=${opts.imageUrl.slice(0, 80)}`);
  const imageUrl = await preflightMediaUrl(opts.imageUrl, "publishInstagram IMAGE");

  const created = await graphFetch(`/${opts.igUserId}/media`, {
    method: "POST",
    qs: {
      image_url: imageUrl,
      caption: opts.caption,
      access_token: igToken,
    },
  });
  const containerId = created?.id;
  if (!containerId) throw new Error("IG no devolvió container id");
  console.log(`[meta] publishInstagram IMAGE container created id=${containerId}`);

  // Polling: usar USER token (opts.token), no igToken (Page token).
  // Ver comentario en waitForIgContainer.
  await waitForIgContainer(containerId, opts.token);

  const published = await graphFetch(`/${opts.igUserId}/media_publish`, {
    method: "POST",
    qs: { creation_id: containerId, access_token: igToken },
  });
  const mediaId = published?.id;
  if (!mediaId) throw new Error("IG no devolvió media id al publicar");
  console.log(`[meta] publishInstagram IMAGE PUBLISHED mediaId=${mediaId}`);
  return mediaId;
}

async function publishInstagramReel(opts: {
  igUserId: string;
  pageId: string;
  token: string; // USER access token
  videoUrl: string;
  caption: string;
}): Promise<string> {
  const igToken = await getPageAccessToken(opts.pageId, opts.token);
  console.log(`[meta] publishInstagram REEL start igUserId=${opts.igUserId} igTokenFp=${tokenFp(igToken)} videoUrl=${opts.videoUrl.slice(0, 80)}`);
  const videoUrl = await preflightMediaUrl(opts.videoUrl, "publishInstagram REEL");

  const created = await graphFetch(`/${opts.igUserId}/media`, {
    method: "POST",
    qs: {
      media_type: "REELS",
      video_url: videoUrl,
      caption: opts.caption,
      share_to_feed: "true",
      access_token: igToken,
    },
  });
  const containerId = created?.id;
  if (!containerId) throw new Error("IG no devolvió container id para video");

  // Videos tardan más en procesarse — hasta 5 min para reels largos.
  // Polling: usar USER token, no igToken. Ver waitForIgContainer.
  await waitForIgContainer(containerId, opts.token, 5 * 60_000);

  const published = await graphFetch(`/${opts.igUserId}/media_publish`, {
    method: "POST",
    qs: { creation_id: containerId, access_token: igToken },
  });
  const mediaId = published?.id;
  if (!mediaId) throw new Error("IG no devolvió media id al publicar reel");
  return mediaId;
}

/** Token fingerprint para logs: longitud + últimos 4 chars. Nunca logueamos el token completo. */
function tokenFp(token: string): string {
  if (!token) return "(empty)";
  return `len=${token.length}/…${token.slice(-4)}`;
}

/**
 * Verifica que Meta pueda descargar el medio: hace GET desde el Worker
 * y loguea status, content-type, tamaño y si hubo redirect. Si la URL
 * redirige, devuelve la URL final resuelta — algunos endpoints de Meta
 * fallan con code=100/subcode=33 cuando la URL inicial es un redirect.
 * Para diagnóstico de fallos tipo "Object cannot be loaded" de IG.
 */
async function preflightMediaUrl(url: string, label: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const ct = res.headers.get("content-type") || "(none)";
    const cl = res.headers.get("content-length") || "(unknown)";
    const finalUrl = res.url;
    const redirected = finalUrl !== url;
    const status = res.ok ? "OK" : "FAIL";
    console.log(
      `[meta] ${label} preflight ${status} status=${res.status} ct=${ct} size=${cl} redirected=${redirected}${redirected ? ` finalUrl=${finalUrl.slice(0, 100)}` : ""}`,
    );
    await res.body?.cancel();
    // Si el GET resolvió a una URL distinta, devolvemos esa para que Meta no
    // tenga que seguir redirects (a veces los rechaza con 100/33).
    return res.ok && redirected ? finalUrl : url;
  } catch (e) {
    console.warn(`[meta] ${label} preflight ERROR err="${(e as Error).message}" (usando url original)`);
    return url;
  }
}

/**
 * Intercambia USER token por PAGE access token; Meta lo requiere para escribir
 * en páginas y para publicar en IG. Loggea exactamente qué responde Meta: si
 * la derivación falla (rol, scope, etc.) la fila cae al USER token, lo cual
 * sí publica FB pero IG lo rechaza con Authorization Error.
 */
async function getPageAccessToken(pageId: string, userToken: string): Promise<string> {
  const url = new URL(`${graphBase()}/${pageId}`);
  url.searchParams.set("fields", "access_token");
  url.searchParams.set("access_token", userToken);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    console.warn(
      `[meta] getPageAccessToken NETWORK_ERROR pageId=${pageId} userTokenFp=${tokenFp(userToken)} err="${(e as Error).message}" → fallback a USER token`,
    );
    return userToken;
  }

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* dejar json=null */ }

  if (!res.ok) {
    const err = json?.error ?? {};
    console.warn(
      `[meta] getPageAccessToken FAILED pageId=${pageId} userTokenFp=${tokenFp(userToken)} status=${res.status} code=${err.code ?? "?"} subcode=${err.error_subcode ?? "?"} message="${err.message ?? text.slice(0, 200)}" fbtrace=${err.fbtrace_id ?? "?"} → fallback a USER token`,
    );
    return userToken;
  }

  const pageToken = typeof json?.access_token === "string" ? json.access_token : "";
  if (!pageToken) {
    console.warn(
      `[meta] getPageAccessToken OK pero SIN access_token en la respuesta pageId=${pageId} userTokenFp=${tokenFp(userToken)} body=${JSON.stringify(json).slice(0, 200)} → fallback a USER token`,
    );
    return userToken;
  }

  console.log(
    `[meta] getPageAccessToken OK pageId=${pageId} userTokenFp=${tokenFp(userToken)} pageTokenFp=${tokenFp(pageToken)} (diff=${pageToken !== userToken})`,
  );
  return pageToken;
}

async function publishFacebook(opts: {
  pageId: string;
  token: string; // USER access token
  imageUrl: string;
  message: string;
}): Promise<string> {
  // FB rechaza /photos con USER token devolviendo (#200) publish_actions deprecated
  // aunque tenga pages_manage_posts.
  const publishToken = await getPageAccessToken(opts.pageId, opts.token);

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

async function publishFacebookVideo(opts: {
  pageId: string;
  token: string; // USER access token
  videoUrl: string;
  description: string;
}): Promise<string> {
  const publishToken = await getPageAccessToken(opts.pageId, opts.token);

  // POST /{page-id}/videos con file_url para que Meta descargue el video desde
  // nuestra URL pública. El processing en Meta sigue async pero la API responde
  // con el id inmediatamente.
  const data = await graphFetch(`/${opts.pageId}/videos`, {
    method: "POST",
    qs: {
      file_url: opts.videoUrl,
      description: opts.description,
      access_token: publishToken,
    },
  });
  const id = data?.id;
  if (!id) throw new Error("FB no devolvió id del video");
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
    const isVideo = data.contenido_tipo === "video";

    if (data.contenido_tipo !== "image" && data.contenido_tipo !== "video") {
      throw new Error("contenido_tipo debe ser 'image' o 'video'");
    }
    if (!data.imagen_url) {
      throw new Error(`Falta URL del medio (${isVideo ? "video" : "imagen"}) en imagen_url`);
    }

    // Instagram — requiere también META_FB_PAGE_ID porque el token de IG se
    // deriva del Page Access Token de la página FB que posee la cuenta IG.
    if (wantsIG) {
      if (!igUserId) {
        results.push({ network: "instagram", ok: false, error: "META_IG_USER_ID no configurado" });
      } else if (!pageId) {
        results.push({ network: "instagram", ok: false, error: "META_FB_PAGE_ID requerido para IG (se usa para derivar el Page Access Token)" });
      } else {
        try {
          const id = isVideo
            ? await publishInstagramReel({
                igUserId,
                pageId,
                token,
                videoUrl: data.imagen_url,
                caption: data.copy.instagram || "",
              })
            : await publishInstagram({
                igUserId,
                pageId,
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
          const id = isVideo
            ? await publishFacebookVideo({
                pageId,
                token,
                videoUrl: data.imagen_url,
                description: data.copy.facebook || "",
              })
            : await publishFacebook({
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
