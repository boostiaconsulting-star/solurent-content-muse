import { createServerFn } from "@tanstack/react-start";

export type MakePayload = {
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

const REDES_KEYS = ["facebook", "instagram", "tiktok", "youtube"] as const;

/** Normaliza el nombre de red a la clave canónica del webhook. */
export function redKey(name: string): "facebook" | "instagram" | "tiktok" | "youtube" | null {
  const n = name.toLowerCase();
  if (n.includes("face")) return "facebook";
  if (n.includes("insta")) return "instagram";
  if (n.includes("tik")) return "tiktok";
  if (n.includes("you")) return "youtube";
  return null;
}

/** Construye el payload exacto que espera Make a partir de copy crudo (keys con cualquier capitalización). */
export function buildMakePayload(input: {
  imagen_url: string | null;
  contenido_tipo: "image" | "video";
  copyRaw: Record<string, string>;
  redesRaw: string[];
  fecha: string | null;
  equipo: string;
}): MakePayload {
  const copy: MakePayload["copy"] = { facebook: "", instagram: "", tiktok: "", youtube: "" };
  for (const [k, v] of Object.entries(input.copyRaw ?? {})) {
    const rk = redKey(k);
    if (rk) copy[rk] = v ?? "";
  }
  const redes = Array.from(
    new Set(
      (input.redesRaw ?? [])
        .map((r) => redKey(r))
        .filter((r): r is (typeof REDES_KEYS)[number] => !!r)
    )
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

export const sendToMake = createServerFn({ method: "POST" })
  .inputValidator((d: MakePayload) => d)
  .handler(async ({ data }) => {
    const url = process.env.MAKE_WEBHOOK_URL;
    if (!url) throw new Error("MAKE_WEBHOOK_URL no configurado");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Webhook Make falló (${res.status}): ${txt.slice(0, 200)}`);
    }
    return { ok: true };
  });
