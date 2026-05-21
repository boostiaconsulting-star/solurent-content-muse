# Migración: Supabase → Cloudflare Workers + Neon (Postgres) + R2

## Estado

**Código: COMPLETO** — build pasa sin errores (`npm run build`).
**Infraestructura: PENDIENTE** — requiere Neon + R2 antes del deploy.

---

## Contexto

Reemplazar Supabase (DB + storage) con:
- **Neon** (Postgres serverless) — reemplaza la DB de Supabase. El schema SQL migra sin cambios: JSONB, arrays, UUIDs y timestamps siguen siendo nativos en Postgres.
- **Cloudflare R2** — reemplaza el storage de Supabase. Mismo modelo de buckets públicos, API compatible con S3.

El proyecto ya corre en Cloudflare Workers, así que no hay cambio de plataforma de deploy. Se eliminó `@supabase/supabase-js` y se reemplazó con `@neondatabase/serverless` (driver Postgres optimizado para edge/Workers).

**Por qué Neon y no D1:** El schema usa JSONB, `TEXT[]` y `gen_random_uuid()` — todo nativo en Postgres. Con D1 (SQLite) habría que serializar JSON a TEXT y gestionar UUIDs en la app. Con Neon no hay ningún cambio al schema ni a las queries.

---

## Arquitectura resultante

```
Browser
  │
  ├─ createServerFn (TanStack Start) ──► Neon (DATABASE_URL via process.env)
  │                                  └─► Cloudflare R2 (bindings via AsyncLocalStorage)
  │
  └─ src/server.ts (Worker fetch handler)
       └─ runWithCfEnv(env, ...) ─► AsyncLocalStorage<CloudflareEnv>
                                      └─ getCfEnv() disponible en todo el request
```

**Decisión clave — acceso a bindings R2 desde `createServerFn`:**
Los bindings R2 de Cloudflare solo están disponibles en el runtime del Worker (server-side), pasados como `env` al fetch handler. Para propagarlos a las server functions se usa `AsyncLocalStorage` de Node.js:
- `src/server.ts` envuelve cada request con `runWithCfEnv(env as CloudflareEnv, () => handler.fetch(...))`
- `getCfEnv()` recupera los bindings desde cualquier punto durante el request

**Por qué no `getRequestEvent` de TanStack Start:**
`@tanstack/react-start/server` en v1.167.50 no exporta `getRequestEvent`. La solución con `AsyncLocalStorage` es más robusta y no depende de internals del framework.

**Upload de archivos desde el browser:**
R2 no tiene cliente JS para subida directa desde browser. Patrón:
1. Browser: `file.arrayBuffer()` → `btoa(String.fromCharCode(...new Uint8Array(ab)))` → base64 string
2. `createServerFn`: `Uint8Array.from(atob(b64), c => c.charCodeAt(0))` → `R2Bucket.put()`

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/db/client.ts` | **NUEVO** — helpers tipados de Neon para todas las tablas |
| `src/lib/cf-env.ts` | **NUEVO** — `AsyncLocalStorage` para bindings R2 (reemplazó `getRequestEvent`) |
| `src/lib/db.functions.ts` | **NUEVO** — server functions CRUD (reemplazan `supabase.from(...)` del cliente) |
| `src/server.ts` | Agrega `runWithCfEnv` en el fetch handler |
| `wrangler.jsonc` | Agrega bindings R2: `BIBLIOTECA`, `CONTENIDO_PROPIO` |
| `src/lib/generate.functions.ts` | `loadBranding()` → Neon; `uploadToBucket()` → R2 |
| `src/lib/branding.functions.ts` | `supabaseAdmin.upsert()` → `dbUpsertBranding()` |
| `src/lib/content-center.ts` | Elimina export `supabase`; mantiene tipos y constantes |
| `src/routes/index.tsx` | 4 ops → server functions |
| `src/routes/nueva.tsx` | 3 queries + 1 storage upload → server functions |
| `src/routes/biblioteca.tsx` | 2 queries + 2 storage ops → server functions |
| `src/routes/branding.tsx` | 1 select → server function |
| `src/routes/metricas.tsx` | 1 select → server function |
| `src/routes/calendario.tsx` | 1 select filtrado → server function |
| `src/components/EditPublicacionDialog.tsx` | 1 update → server function |
| `src/integrations/supabase/` | **ELIMINADO** — carpeta completa |
| `.env` | Limpiado — sin variables SUPABASE_* |
| `.dev.vars` | Template para desarrollo local con wrangler |

---

## Schema SQL (aplicar en Neon SQL Editor)

```sql
CREATE TABLE IF NOT EXISTS publicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo TEXT,
  idea TEXT,
  angulo TEXT,
  formato TEXT,
  redes TEXT[],
  copy JSONB,
  imagen_url TEXT,
  contenido_url TEXT,
  contenido_tipo TEXT CHECK (contenido_tipo IS NULL OR contenido_tipo IN ('video','imagen')),
  fecha_programada TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'draft',
  origen TEXT NOT NULL DEFAULT 'ia' CHECK (origen IN ('ia','contenido_propio')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS biblioteca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publicacion_contexto (
  publicacion_id UUID NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  archivo_id UUID NOT NULL REFERENCES biblioteca(id) ON DELETE CASCADE,
  PRIMARY KEY (publicacion_id, archivo_id)
);

CREATE TABLE IF NOT EXISTS branding (
  id TEXT PRIMARY KEY DEFAULT 'default',
  website_url TEXT,
  logo_url TEXT,
  colors JSONB,
  fonts JSONB,
  raw JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO branding (id, website_url) VALUES ('default', 'https://www.solurent.mx')
  ON CONFLICT (id) DO NOTHING;
```

---

## Infraestructura pendiente (antes del deploy)

### 1. Neon

```bash
# 1. Crear cuenta en neon.tech (free tier: 0.5 GB)
# 2. Crear proyecto "solurent-content-muse"
# 3. Copiar la Connection string
# 4. Aplicar el schema SQL de arriba en el SQL Editor de Neon
```

### 2. Cloudflare R2

```bash
# En Cloudflare Dashboard → R2:
# 1. Crear bucket: "biblioteca" → Settings → Public Access: habilitar
# 2. Crear bucket: "contenido-propio" → Settings → Public Access: habilitar
# 3. Anotar las public URLs (https://pub-xxx.r2.dev/...)
```

### 3. Variables de entorno locales

Rellenar `.dev.vars` con valores reales:

```
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
R2_PUBLIC_URL_BIBLIOTECA=https://pub-xxx.r2.dev/biblioteca
R2_PUBLIC_URL_CONTENIDO=https://pub-xxx.r2.dev/contenido-propio
ANTHROPIC_API_KEY=sk-ant-...
LOVABLE_API_KEY=...
HIGGSFIELD_API_KEY=...
HIGGSFIELD_API_SECRET=...
MAKE_WEBHOOK_URL=https://hook.eu...
```

---

## Deploy a producción

```bash
# 1. Verificar build sin errores
npm run build

# 2. Configurar secrets en Cloudflare
npx wrangler secret put DATABASE_URL
npx wrangler secret put R2_PUBLIC_URL_BIBLIOTECA
npx wrangler secret put R2_PUBLIC_URL_CONTENIDO
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put LOVABLE_API_KEY
npx wrangler secret put HIGGSFIELD_API_KEY
npx wrangler secret put HIGGSFIELD_API_SECRET
npx wrangler secret put MAKE_WEBHOOK_URL

# 3. Deploy
npx wrangler deploy
```

> **Workers Paid recomendado:** El flujo de Higgsfield hace polling hasta 90 s. Workers Free tiene límite de 30 s de wall-clock. Workers Paid ($5/mes) elimina ese límite.

---

## Verificación post-deploy

| # | Flujo | Qué verificar |
|---|---|---|
| 1 | `/` carga publicaciones | Lista carga, sin errores en consola |
| 2 | `/` eliminar publicación | Fila desaparece de la lista |
| 3 | `/` reprogramar publicación | Fecha actualizada, webhook a Make |
| 4 | `/nueva` flujo IA (5 pasos) | Imagen generada con URL de R2 (no `supabase.co`) |
| 5 | `/nueva` flujo contenido propio | `contenido_url` apunta a R2 |
| 6 | `/biblioteca` subir PDF + imagen | URLs en cards apuntan a R2 |
| 7 | `/biblioteca` eliminar archivo | Fila desaparece, objeto borrado de R2 |
| 8 | `/branding` analizar sitio | Paleta y logo se actualizan y persisten |
| 9 | `/metricas` | Conteos correctos |
| 10 | `/calendario` | Solo publicaciones con fecha programada |
| 11 | `EditPublicacionDialog` editar copy | Cambios persisten tras recargar |
| 12 | `EditPublicacionDialog` regenerar imagen | Nueva URL de R2 en la publicación |

**Señales de éxito:**
- Sin referencias a `supabase.co` en ninguna URL de imagen/archivo
- Sin variables `SUPABASE_*` requeridas
- `npm run build` sin errores de tipos
- Los 12 flujos pasan sin errores en consola de red ni en Workers logs
