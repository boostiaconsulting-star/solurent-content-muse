import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type GenInput = {
  equipo: string;
  idea: string;
  angulo: string;
  formato: string;
  redes: string[];
  contextoExtra?: string;
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

export const generateImage = createServerFn({ method: "POST" })
  .inputValidator((d: GenInput) => d)
  .handler(async ({ data }) => {
    const HF_KEY = process.env.HIGGSFIELD_API_KEY;
    const HF_SECRET = process.env.HIGGSFIELD_API_SECRET;
    if (!HF_KEY || !HF_SECRET) throw new Error("HIGGSFIELD_API_KEY / HIGGSFIELD_API_SECRET no configuradas");

    const prompt = `Imagen publicitaria profesional para redes sociales de Solurent (renta de equipos industriales).
Equipo/producto: ${data.equipo || "equipo industrial"}
Ángulo de comunicación: ${data.angulo}
Formato: ${data.formato}
Idea/mensaje: ${data.idea}
${data.contextoExtra ? `Contexto extra: ${data.contextoExtra}` : ""}

Estilo: fotografía comercial premium, iluminación natural, composición limpia, alto contraste, sin texto sobre la imagen, calidad 4K.`;

    const authHeader = `Key ${HF_KEY}:${HF_SECRET}`;

    // 1) Lanzar generación
    const res = await fetch("https://platform.higgsfield.ai/higgsfield-ai/soul/standard", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: "1:1",
        resolution: "1080p",
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 401 || res.status === 403) throw new Error("Credenciales de Higgsfield inválidas. Revísalas en Configuración.");
      if (res.status === 429) throw new Error("Límite de Higgsfield alcanzado, intenta de nuevo en un momento.");
      if (res.status === 402) throw new Error("Sin créditos en Higgsfield. Agrega saldo en cloud.higgsfield.ai.");
      throw new Error(`Error generando imagen (${res.status}): ${t}`);
    }

    const initial = await res.json();
    const requestId: string | undefined = initial.request_id || initial.id;
    let statusUrl: string | undefined = initial.status_url;
    let imageUrl: string | undefined = initial.images?.[0]?.url;

    // 2) Poll si no vino completa
    if (!imageUrl) {
      if (!statusUrl && requestId) {
        statusUrl = `https://platform.higgsfield.ai/requests/${requestId}/status`;
      }
      if (!statusUrl) throw new Error("Higgsfield no devolvió status_url ni request_id");

      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const sres = await fetch(statusUrl, {
          headers: { Authorization: authHeader, Accept: "application/json" },
        });
        if (!sres.ok) continue;
        const sjson = await sres.json();
        const status = sjson.status;
        if (status === "completed") {
          imageUrl = sjson.images?.[0]?.url || sjson.results?.[0]?.url;
          break;
        }
        if (status === "failed") throw new Error("Higgsfield falló: " + (sjson.error || "sin detalle"));
        if (status === "nsfw") throw new Error("Higgsfield rechazó el prompt por contenido (NSFW). Reformula la idea.");
      }
      if (!imageUrl) throw new Error("Higgsfield no completó la generación a tiempo. Intenta de nuevo.");
    }

    // 3) Descargar y subir al bucket contenido_propio
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error("No se pudo descargar la imagen de Higgsfield");
    const mime = imgRes.headers.get("content-type") || "image/png";
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    const ext = mime.split("/")[1]?.split(";")[0] || "png";
    const path = `higgsfield/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("contenido_propio")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) throw new Error("No se pudo guardar la imagen: " + upErr.message);

    const { data: pub } = supabaseAdmin.storage.from("contenido_propio").getPublicUrl(path);
    return { url: pub.publicUrl };
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
