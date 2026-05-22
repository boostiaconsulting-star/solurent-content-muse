# Migración: Supabase → Neon + Cloudflare R2

## Contexto

El proyecto corre en **Cloudflare Workers** (TanStack Start SSR). La BD y el storage están actualmente en Supabase. Esta guía cubre mover la BD a **Neon** (serverless PostgreSQL) y el storage a **Cloudflare R2**, manteniendo el mismo schema sin reescritura.

---

## Por qué Neon y no Cloudflare D1

| | Neon | Cloudflare D1 |
|---|---|---|
| Motor | PostgreSQL | SQLite |
| Compatibilidad con schema actual | ✅ Nativa | ❌ Requiere reescribir (JSONB, UUID, TEXT[]) |
| Driver para Workers | `@neondatabase/serverless` (HTTP/WS) | D1 Binding nativo |
| Costo | Free tier: 0.5GB / 191h compute/mes | Free tier: 5GB / 5M rows/day |
| Storage | Externo (R2) | Externo (R2) |

El schema usa tipos PostgreSQL-específicos (`JSONB`, `TEXT[]`, `UUID`) que no tienen equivalente nativo en SQLite. Neon es la opción con menor riesgo de regresiones.

---

## Compatibilidad de migraciones existentes

| Archivo | Contenido | ¿Corre en Neon? |
|---|---|---|
| `supabase/migrations/20260510021318_...sql` | Tablas publicaciones, biblioteca, publicacion_contexto + RLS | ✅ Tal cual |
| `supabase/migrations/20260512005318_...sql` | Buckets `storage.buckets` / `storage.objects` | ❌ Supabase-específico — omitir |
| `supabase/migrations/20260512042236_...sql` | Tabla branding + RLS + insert default | ✅ Tal cual |

Las migraciones 1 y 3 son PostgreSQL estándar y se pueden ejecutar directamente contra Neon.

---

## Plan de migración

### 1. Crear proyecto en Neon

1. Crear proyecto en [neon.tech](https://neon.tech) (Free tier es suficiente para empezar)
2. Copiar el `DATABASE_URL` (formato: `postgresql://user:pass@host.neon.tech/neondb?sslmode=require`)

### 2. Aplicar el schema

```bash
# Aplicar las migraciones compatibles (omitir la de storage)
psql $DATABASE_URL -f supabase/migrations/20260510021318_598bcf81-9940-4238-a2d4-e0dd57e16e86.sql
psql $DATABASE_URL -f supabase/migrations/20260512042236_11542f18-d6ed-425b-8236-3940bc0a6bb8.sql
```

### 3. Instalar dependencias

```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
```

### 4. Reemplazar el cliente de Supabase

**Nuevo:** `src/integrations/neon/client.server.ts`

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql);
}
```

**Eliminar:**
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/types.ts` (reemplazar con schema Drizzle)

### 5. Crear schema Drizzle

**Nuevo:** `src/integrations/neon/schema.ts`

```ts
import { pgTable, uuid, text, jsonb, timestamptz, primaryKey } from "drizzle-orm/pg-core";

export const publicaciones = pgTable("publicaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  equipo: text("equipo"),
  idea: text("idea"),
  angulo: text("angulo"),
  formato: text("formato"),
  redes: text("redes").array(),
  copy: jsonb("copy"),
  imagen_url: text("imagen_url"),
  fecha_programada: timestamptz("fecha_programada"),
  estado: text("estado").notNull().default("draft"),
  origen: text("origen").notNull().default("ia"),
  contenido_url: text("contenido_url"),
  contenido_tipo: text("contenido_tipo"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

export const biblioteca = pgTable("biblioteca", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  categoria: text("categoria"),
  url: text("url").notNull(),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

export const publicacionContexto = pgTable("publicacion_contexto", {
  publicacion_id: uuid("publicacion_id").notNull().references(() => publicaciones.id, { onDelete: "cascade" }),
  archivo_id: uuid("archivo_id").notNull().references(() => biblioteca.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.publicacion_id, t.archivo_id] })]);

export const branding = pgTable("branding", {
  id: text("id").primaryKey().default("default"),
  website_url: text("website_url"),
  logo_url: text("logo_url"),
  colors: jsonb("colors"),
  fonts: jsonb("fonts"),
  raw: jsonb("raw"),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});
```

### 6. Configurar Drizzle Kit

**Nuevo:** `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/integrations/neon/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 7. Reemplazar Storage: Supabase → Cloudflare R2

**`wrangler.jsonc`** — agregar binding R2:

```jsonc
{
  "r2_buckets": [
    { "binding": "BIBLIOTECA", "bucket_name": "biblioteca" },
    { "binding": "CONTENIDO_PROPIO", "bucket_name": "contenido-propio" }
  ]
}
```

Crear los buckets en Cloudflare:

```bash
wrangler r2 bucket create biblioteca
wrangler r2 bucket create contenido-propio
```

**Helper de upload** (`src/lib/storage.ts`):

```ts
export async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  body: ArrayBuffer,
  contentType: string
): Promise<string> {
  await bucket.put(key, body, { httpMetadata: { contentType } });
  // Retorna URL pública (requiere habilitar public access en el bucket)
  return `https://pub-<account>.r2.dev/${key}`;
}
```

> Las URLs existentes en `imagen_url` de Supabase Storage seguirán funcionando mientras no se elimine el bucket de Supabase. Para migrar archivos existentes, usar `rclone` o scripts de copia.

### 8. Variables de entorno

**Agregar en `.env` y en Cloudflare Workers secrets:**

```
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
```

**Eliminar (ya no necesarias):**

```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

### 9. Actualizar rutas y server functions

Buscar todos los usos de `supabase` en `src/routes/` y `src/lib/` y reemplazar con `getDb()` + Drizzle queries.

```bash
grep -r "supabase" src/ --include="*.ts" --include="*.tsx" -l
```

---

## Verificación

```bash
# 1. Dev local
wrangler dev

# 2. Verificar conexión a Neon
# Crear una publicación y confirmar que persiste

# 3. Verificar R2 storage
# Subir un archivo a biblioteca y verificar URL pública

# 4. Deploy
wrangler deploy
```

---

## Opciones de Auth (para cuando se implemente)

| Opción | Vendor lock-in | Setup | Workers support | Recomendado si |
|---|---|---|---|---|
| **Supabase Auth** (solo auth, BD en Neon) | Supabase | Mínimo | ✅ | Quieres migrar rápido sin tocar auth |
| **Clerk** | Clerk | Fácil | ✅ SDK oficial | Quieres la mejor DX |
| **Better Auth** | Ninguno | Medio | ✅ | Quieres control total y cero dependencias externas |

> Actualmente el RLS es público y `auth-middleware.ts` solo verifica Bearer tokens — la implementación real de auth puede hacerse de forma independiente a esta migración.
