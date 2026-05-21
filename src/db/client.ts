import { neon } from "@neondatabase/serverless";
import type { Publicacion, Archivo } from "@/lib/content-center";

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no configurada");
  return neon(url);
}

// ---------- Publicaciones ----------

export async function dbGetPublicaciones(): Promise<Publicacion[]> {
  const db = sql();
  const rows = await db`SELECT * FROM publicaciones ORDER BY created_at DESC`;
  return rows as unknown as Publicacion[];
}

export async function dbGetPublicacionesProgramadas(): Promise<Publicacion[]> {
  const db = sql();
  const rows = await db`
    SELECT * FROM publicaciones
    WHERE fecha_programada IS NOT NULL
    ORDER BY fecha_programada ASC
  `;
  return rows as unknown as Publicacion[];
}

export async function dbInsertPublicacion(
  row: Omit<Publicacion, "id" | "created_at">
): Promise<Publicacion> {
  const db = sql();
  const [result] = await db`
    INSERT INTO publicaciones
      (equipo, idea, angulo, formato, redes, copy, imagen_url, contenido_url,
       contenido_tipo, fecha_programada, estado, origen)
    VALUES
      (${row.equipo}, ${row.idea}, ${row.angulo}, ${row.formato},
       ${row.redes as unknown as string}, ${JSON.stringify(row.copy)},
       ${row.imagen_url}, ${row.contenido_url}, ${row.contenido_tipo},
       ${row.fecha_programada}, ${row.estado}, ${row.origen})
    RETURNING *
  `;
  return result as unknown as Publicacion;
}

export async function dbUpdatePublicacion(
  id: string,
  patch: Partial<Publicacion>
): Promise<void> {
  const db = sql();
  if (patch.estado !== undefined || patch.fecha_programada !== undefined) {
    await db`
      UPDATE publicaciones SET
        estado = COALESCE(${patch.estado ?? null}, estado),
        fecha_programada = ${patch.fecha_programada ?? null}
      WHERE id = ${id}
    `;
  }
  if (patch.copy !== undefined || patch.imagen_url !== undefined) {
    await db`
      UPDATE publicaciones SET
        copy = COALESCE(${JSON.stringify(patch.copy)}, copy),
        imagen_url = COALESCE(${patch.imagen_url ?? null}, imagen_url)
      WHERE id = ${id}
    `;
  }
}

export async function dbDeletePublicacion(id: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM publicaciones WHERE id = ${id}`;
}

// ---------- Biblioteca ----------

export async function dbGetBiblioteca(): Promise<Archivo[]> {
  const db = sql();
  const rows = await db`SELECT * FROM biblioteca ORDER BY created_at DESC`;
  return rows as unknown as Archivo[];
}

export async function dbInsertBiblioteca(
  row: Omit<Archivo, "id" | "created_at">
): Promise<Archivo> {
  const db = sql();
  const [result] = await db`
    INSERT INTO biblioteca (nombre, tipo, categoria, url)
    VALUES (${row.nombre}, ${row.tipo}, ${row.categoria ?? null}, ${row.url})
    RETURNING *
  `;
  return result as unknown as Archivo;
}

export async function dbDeleteBiblioteca(id: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM biblioteca WHERE id = ${id}`;
}

// ---------- Publicacion Contexto ----------

export async function dbInsertContexto(
  publicacion_id: string,
  archivo_ids: string[]
): Promise<void> {
  if (!archivo_ids.length) return;
  const db = sql();
  for (const archivo_id of archivo_ids) {
    await db`
      INSERT INTO publicacion_contexto (publicacion_id, archivo_id)
      VALUES (${publicacion_id}, ${archivo_id})
      ON CONFLICT DO NOTHING
    `;
  }
}

// ---------- Branding ----------

export type BrandingRow = {
  id: string;
  website_url: string | null;
  logo_url: string | null;
  colors: Record<string, string> | null;
  fonts: Record<string, string> | null;
  raw?: Record<string, string> | null;
  updated_at?: string;
};

export async function dbGetBranding(): Promise<BrandingRow | null> {
  const db = sql();
  const [row] = await db`SELECT * FROM branding WHERE id = 'default'`;
  return (row as unknown as BrandingRow) ?? null;
}

export async function dbUpsertBranding(row: BrandingRow): Promise<void> {
  const db = sql();
  await db`
    INSERT INTO branding (id, website_url, logo_url, colors, fonts, raw, updated_at)
    VALUES (
      ${row.id},
      ${row.website_url ?? null},
      ${row.logo_url ?? null},
      ${JSON.stringify(row.colors ?? null)},
      ${JSON.stringify(row.fonts ?? null)},
      ${JSON.stringify(row.raw ?? null)},
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      website_url = EXCLUDED.website_url,
      logo_url    = EXCLUDED.logo_url,
      colors      = EXCLUDED.colors,
      fonts       = EXCLUDED.fonts,
      raw         = EXCLUDED.raw,
      updated_at  = now()
  `;
}
