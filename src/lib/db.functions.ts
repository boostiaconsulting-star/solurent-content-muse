import { createServerFn } from "@tanstack/react-start";
import {
  dbGetPublicaciones,
  dbGetPublicacionesProgramadas,
  dbInsertPublicacion,
  dbUpdatePublicacion,
  dbDeletePublicacion,
  dbGetBiblioteca,
  dbInsertBiblioteca,
  dbDeleteBiblioteca,
  dbInsertContexto,
  dbGetBranding,
} from "@/db/client";
import { getCfEnv } from "@/lib/cf-env";
import type { Publicacion, Archivo } from "@/lib/content-center";

// ── Publicaciones ──────────────────────────────────────────────────────────

export const fetchPublicaciones = createServerFn({ method: "GET" }).handler(
  () => dbGetPublicaciones()
);

export const fetchPublicacionesProgramadas = createServerFn({
  method: "GET",
}).handler(() => dbGetPublicacionesProgramadas());

export const createPublicacion = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      publicacion: Omit<Publicacion, "id" | "created_at">;
      contexto: string[];
    }) => d
  )
  .handler(async ({ data }) => {
    const pub = await dbInsertPublicacion(data.publicacion);
    await dbInsertContexto(pub.id, data.contexto);
    return pub;
  });

export const updatePublicacion = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; patch: Partial<Publicacion> }) => d)
  .handler(({ data }) => dbUpdatePublicacion(data.id, data.patch));

export const deletePublicacion = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(({ data }) => dbDeletePublicacion(data.id));

// ── Biblioteca ─────────────────────────────────────────────────────────────

export const fetchBiblioteca = createServerFn({ method: "GET" }).handler(
  () => dbGetBiblioteca()
);

export const uploadBibliotecaFile = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      nombre: string;
      tipo: string;
      categoria: string;
      fileBase64: string;
      mimeType: string;
      ext: string;
    }) => d
  )
  .handler(async ({ data }) => {
    const { BIBLIOTECA, R2_PUBLIC_URL_BIBLIOTECA } = getCfEnv();
    const key = `${crypto.randomUUID()}.${data.ext}`;
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) =>
      c.charCodeAt(0)
    );
    await BIBLIOTECA.put(key, bytes, {
      httpMetadata: { contentType: data.mimeType },
    });
    const url = `${R2_PUBLIC_URL_BIBLIOTECA}/${key}`;
    return dbInsertBiblioteca({
      nombre: data.nombre,
      tipo: data.tipo,
      categoria: data.categoria,
      url,
    });
  });

export const deleteBibliotecaFile = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; url: string }) => d)
  .handler(async ({ data }) => {
    const { BIBLIOTECA } = getCfEnv();
    const key = data.url.split("/").pop()!;
    await BIBLIOTECA.delete(key);
    await dbDeleteBiblioteca(data.id);
  });

// ── Contenido Propio (upload del usuario) ─────────────────────────────────

export const uploadContenidoPropio = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { fileBase64: string; mimeType: string; path: string }) => d
  )
  .handler(async ({ data }) => {
    const { CONTENIDO_PROPIO, R2_PUBLIC_URL_CONTENIDO } = getCfEnv();
    const bytes = Uint8Array.from(atob(data.fileBase64), (c) =>
      c.charCodeAt(0)
    );
    await CONTENIDO_PROPIO.put(data.path, bytes, {
      httpMetadata: { contentType: data.mimeType },
    });
    return { publicUrl: `${R2_PUBLIC_URL_CONTENIDO}/${data.path}` };
  });

// ── Branding ───────────────────────────────────────────────────────────────

export const fetchBranding = createServerFn({ method: "GET" }).handler(() =>
  dbGetBranding()
);

// Re-export types so callers don't need to import from two places
export type { Publicacion, Archivo };
