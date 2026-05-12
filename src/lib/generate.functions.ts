import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type GenInput = {
  equipo: string;
  idea: string;
  angulo: string;
  formato: string;
  redes: string[];
  contextoExtra?: string;
  /** Public URLs of reference images. If provided, generation uses image-to-image (Nano Banana). */
  referenceImageUrls?: string[];
  /** Free-form additional instructions from the user (chat in step 4). */
  instrucciones?: string;
};

const REDES_GUIDE: Record<string, string> = {
  Instagram:
    "Tono visual y aspiracional. 1-2 emojis bien colocados. Hook potente en la 1ª línea. Máx ~150 palabras. Termina con 4-6 hashtags relevantes en una sola línea.",
  Facebook:
    "Tono cercano y descriptivo, profesional. Puede ser más largo (hasta ~250 palabras). CTA claro al final (cotizar/llamar). Sin hashtags o máximo 1-2.",
  TikTok:
    "Tono casual, en primera persona o POV. Hook impactante en la 1ª línea. Muy corto (máx 80 palabras). Hashtags virales: #fyp #parati y específicos del nicho.",
  "YouTube Shorts":
    "Título-gancho corto al inicio + descripción breve (máx 100 palabras). 3-5 hashtags al final. Tono dinámico y directo.",
};

type BrandCtx = { colors?: Record<string, string> | null; logo_url?: string | null } | null;

async function loadBranding(): Promise<BrandCtx> {
  try {
    const { data } = await supabaseAdmin
      .from("branding").select("colors, logo_url").eq("id", "default").maybeSingle();
    return (data ?? null) as BrandCtx;
  } catch { return null; }
}

function brandBlock(brand: BrandCtx): string {
  if (!brand) return "";
  const c = brand.colors ?? {};
  const palette = Object.entries(c).filter(([, v]) => !!v).map(([k, v]) => `${k} ${v}`).join(", ");
  if (!palette) return "";
  return `\n\nIDENTIDAD DE MARCA SOLURENT (respeta esta paleta en la imagen):
Paleta: ${palette}.
Usa estos colores en luces, props, fondos o gráficos sutiles para que la imagen se sienta de la marca. No incluyas el logo en la imagen, solo respeta el estilo cromático.`;
}

function buildPrompt(data: GenInput, withReference: boolean, brand: BrandCtx) {
  const base = `Imagen publicitaria profesional para redes sociales de Solurent (renta de equipos industriales).
Equipo/producto: ${data.equipo || "equipo industrial"}
Ángulo de comunicación: ${data.angulo}
Formato: ${data.formato}
Idea/mensaje: ${data.idea}
${data.contextoExtra ? `Contexto extra: ${data.contextoExtra}` : ""}
${data.instrucciones ? `Instrucciones específicas del usuario: ${data.instrucciones}` : ""}

Estilo: fotografía comercial premium, iluminación natural, composición limpia, alto contraste, sin texto sobre la imagen, calidad 4K.${brandBlock(brand)}`;

  if (withReference) {
    return `${base}

IMPORTANTE: Usa la(s) imagen(es) adjunta(s) como REFERENCIA VISUAL del equipo real (forma, color, marca, proporciones). El equipo en la imagen final debe verse igual al de la referencia. Recrea la escena en un contexto publicitario profesional manteniendo la identidad del producto.`;
  }
  return base;
}

function slug(s: string): string {
  return (s || "sin-nombre")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "sin-nombre";
}

export function buildAssetName(equipo: string, ext: string): string {
  return `${slug(equipo)}_${Date.now()}.${ext}`;
}

async function uploadToBucket(bytes: Uint8Array, mime: string, equipo: string): Promise<string> {
  const ext = (mime.split("/")[1]?.split(";")[0] || "png").toLowerCase().replace("jpeg", "jpg");
  const path = `gen/${buildAssetName(equipo, ext)}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("contenido_propio")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) throw new Error("No se pudo guardar la imagen: " + upErr.message);
  const { data: pub } = supabaseAdmin.storage.from("contenido_propio").getPublicUrl(path);
  return pub.publicUrl;
}

/** Image-to-image / reference-aware generation via Lovable AI Nano Banana. */
async function generateWithNanoBanana(data: GenInput, brand: BrandCtx): Promise<string> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");

  const refs = (data.referenceImageUrls ?? []).slice(0, 4); // cap a 4 referencias
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: buildPrompt(data, refs.length > 0, brand) },
    ...refs.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("Límite de Lovable AI alcanzado, intenta de nuevo en un momento.");
    if (res.status === 402) throw new Error("Sin créditos de Lovable AI. Agrega saldo en Settings → Workspace → Usage.");
    throw new Error(`Error generando imagen (${res.status}): ${t}`);
  }

  const json = await res.json();
  const dataUrl: string | undefined = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl || !dataUrl.startsWith("data:")) {
    throw new Error("Nano Banana no devolvió una imagen.");
  }

  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:([^;]+)/)?.[1] || "image/png";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return uploadToBucket(bytes, mime, data.equipo);
}

/** Text-only generation via Higgsfield Soul. */
async function generateWithHiggsfield(data: GenInput, brand: BrandCtx): Promise<string> {
  const HF_KEY = process.env.HIGGSFIELD_API_KEY;
  const HF_SECRET = process.env.HIGGSFIELD_API_SECRET;
  if (!HF_KEY || !HF_SECRET) throw new Error("HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET no configuradas");

  const authHeader = `Key ${HF_KEY}:${HF_SECRET}`;
  const res = await fetch("https://platform.higgsfield.ai/higgsfield-ai/soul/standard", {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ prompt: buildPrompt(data, false, brand), aspect_ratio: "1:1", resolution: "1080p" }),
  });

  if (!res.ok) {
    const t = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error("Credenciales de Higgsfield inválidas.");
    if (res.status === 429) throw new Error("Límite de Higgsfield alcanzado, intenta de nuevo en un momento.");
    if (res.status === 402) throw new Error("Sin créditos en Higgsfield. Agrega saldo en cloud.higgsfield.ai.");
    if (res.status === 500) throw new Error("Higgsfield rechazó las credenciales (500). Verifica KEY_ID y KEY_SECRET.");
    throw new Error(`Error generando imagen (${res.status}): ${t}`);
  }

  const initial = await res.json();
  const requestId: string | undefined = initial.request_id || initial.id;
  let statusUrl: string | undefined = initial.status_url;
  let imageUrl: string | undefined = initial.images?.[0]?.url;

  if (!imageUrl) {
    if (!statusUrl && requestId) statusUrl = `https://platform.higgsfield.ai/requests/${requestId}/status`;
    if (!statusUrl) throw new Error("Higgsfield no devolvió status_url ni request_id");
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const sres = await fetch(statusUrl, { headers: { Authorization: authHeader, Accept: "application/json" } });
      if (!sres.ok) continue;
      const sjson = await sres.json();
      if (sjson.status === "completed") {
        imageUrl = sjson.images?.[0]?.url || sjson.results?.[0]?.url;
        break;
      }
      if (sjson.status === "failed") throw new Error("Higgsfield falló: " + (sjson.error || "sin detalle"));
      if (sjson.status === "nsfw") throw new Error("Higgsfield rechazó el prompt por contenido (NSFW).");
    }
    if (!imageUrl) throw new Error("Higgsfield no completó la generación a tiempo.");
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error("No se pudo descargar la imagen de Higgsfield");
  const mime = imgRes.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  return uploadToBucket(bytes, mime, data.equipo);
}

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: GenInput) => d)
  .handler(async ({ data }) => {
    const brand = await loadBranding();
    const hasRefs = (data.referenceImageUrls ?? []).length > 0;
    const url = hasRefs
      ? await generateWithNanoBanana(data, brand)
      : await generateWithHiggsfield(data, brand);
    return { url };
  });

export const generateCopies = createServerFn({ method: "POST" })
  .inputValidator((d: GenInput) => d)
  .handler(async ({ data }) => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

    const redesBlock = data.redes
      .map((r) => `- ${r}: ${REDES_GUIDE[r] ?? "Tono profesional, breve, con CTA."}`)
      .join("\n");

    const system = `Eres copywriter senior de Solurent (empresa mexicana de renta de equipos industriales). Escribes en español neutro de México, claro, persuasivo y profesional. Adaptas el copy a cada red social respetando su tono, longitud y formato. Nunca inventas datos técnicos. Usas el ángulo indicado como eje narrativo. Respondes ÚNICAMENTE con un objeto JSON válido, sin texto extra, sin bloques de código.`;

    const user = `Genera el copy de una publicación con los siguientes datos:

Equipo/producto: ${data.equipo || "(sin especificar)"}
Idea / mensaje principal: ${data.idea}
Ángulo: ${data.angulo}
Formato visual: ${data.formato}
${data.contextoExtra ? `Contexto adicional: ${data.contextoExtra}` : ""}

Redes y guías:
${redesBlock}

Devuelve un JSON con esta forma exacta (sin nada más):
{
${data.redes.map((r) => `  "${r}": "copy optimizado para ${r}"`).join(",\n")}
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Error generando copy (${res.status}): ${t}`);
    }

    const json = await res.json();
    const text: string = json.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Respuesta de Claude sin JSON: " + text.slice(0, 200));

    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      throw new Error("JSON inválido de Claude: " + (e as Error).message);
    }

    const out: Record<string, string> = {};
    for (const r of data.redes) out[r] = parsed[r] ?? "";
    return { copies: out };
  });
