import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildMetaPayload, publishMetaPayload } from "./meta.functions";

type PublicacionRow = {
  id: string;
  equipo: string | null;
  redes: string[] | null;
  copy: Record<string, string> | null;
  imagen_url: string | null;
  contenido_url: string | null;
  contenido_tipo: string | null;
  origen: string | null;
  estado: string | null;
  fecha_programada: string | null;
};

/**
 * Busca publicaciones programadas vencidas y las publica a Meta.
 * Claim atómico: estado='aprobado' → 'publicando' antes de publicar, para
 * evitar doble publicación si dos cron ticks se solapan.
 * En fallo, revierte a 'aprobado' para reintento automático en el siguiente tick.
 */
export async function runScheduledPublications(): Promise<{
  scanned: number;
  published: number;
  failed: number;
}> {
  const nowIso = new Date().toISOString();
  const { data: pending, error } = await supabaseAdmin
    .from("publicaciones")
    .select("id, equipo, redes, copy, imagen_url, contenido_url, contenido_tipo, origen, estado, fecha_programada")
    .eq("estado", "aprobado")
    .not("fecha_programada", "is", null)
    .lte("fecha_programada", nowIso)
    .limit(20);

  if (error) {
    console.error("[cron] error consultando publicaciones pendientes:", error.message);
    return { scanned: 0, published: 0, failed: 0 };
  }

  const rows = (pending ?? []) as PublicacionRow[];
  console.log(`[cron] query: now=${nowIso} found=${rows.length} ids=${rows.map((r) => r.id).join(",") || "(none)"}`);
  let published = 0;
  let failed = 0;

  for (const row of rows) {
    // Claim atómico: solo procede si nadie más lo ha tomado.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("publicaciones")
      .update({ estado: "publicando" })
      .eq("id", row.id)
      .eq("estado", "aprobado")
      .select("id")
      .maybeSingle();

    if (claimErr) {
      console.error(`[cron] error reclamando ${row.id}:`, claimErr.message);
      continue;
    }
    if (!claimed) {
      // Otro tick ya lo tomó.
      continue;
    }

    try {
      const imagenUrl = row.imagen_url ?? row.contenido_url;
      if (!imagenUrl) {
        throw new Error("Falta imagen_url / contenido_url en la fila");
      }
      // Solo soportamos imagen vía Meta (matches publishMetaPayload validation).
      const tipo: "image" | "video" =
        row.contenido_tipo === "video" ? "video" : "image";

      const payload = buildMetaPayload({
        imagen_url: imagenUrl,
        contenido_tipo: tipo,
        copyRaw: row.copy ?? {},
        redesRaw: row.redes ?? [],
        fecha: row.fecha_programada,
        equipo: row.equipo ?? "",
      });

      const result = await publishMetaPayload(payload);
      if (!result.ok) {
        const errs = result.results
          .filter((r) => !r.ok && !r.skipped)
          .map((r) => `${r.network}: ${r.error}`)
          .join(" · ");
        throw new Error(errs || "Meta rechazó la publicación");
      }

      await supabaseAdmin
        .from("publicaciones")
        .update({ estado: "publicado", fecha_programada: null })
        .eq("id", row.id);

      const pubIds = result.results.filter((r) => r.ok).map((r) => r.network).join(", ");
      console.log(`[cron] publicado ${row.id} en ${pubIds}`);
      published++;
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[cron] falló publicar ${row.id}: ${msg}`);
      // Revertir a 'aprobado' para reintento en el siguiente tick.
      await supabaseAdmin
        .from("publicaciones")
        .update({ estado: "aprobado" })
        .eq("id", row.id);
      failed++;
    }
  }

  return { scanned: rows.length, published, failed };
}
