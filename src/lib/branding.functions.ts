import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Brand = {
  website_url: string | null;
  logo_url: string | null;
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  } | null;
  fonts: { heading?: string; body?: string } | null;
};

function absolutize(url: string, base: string): string {
  try { return new URL(url, base).toString(); } catch { return url; }
}

/** Fetch site HTML and extract logo URL + brand colors via Lovable AI. */
export const analyzeBranding = createServerFn({ method: "POST" })
  .inputValidator((d: { website_url: string }) => d)
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");

    const url = data.website_url.startsWith("http") ? data.website_url : `https://${data.website_url}`;

    // 1) Fetch HTML
    const htmlRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 SolurentBot/1.0" } });
    if (!htmlRes.ok) throw new Error(`No se pudo abrir ${url} (${htmlRes.status})`);
    const html = (await htmlRes.text()).slice(0, 200_000); // cap

    // 2) Ask Gemini to extract structured branding via tool calling
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Eres un experto en branding. Analiza el HTML de un sitio web y extrae el logo y la paleta de marca. Responde SOLO usando la herramienta extract_branding. Para los colores devuelve hex (#RRGGBB). Para el logo prefiere un <img> en el header con palabras 'logo' o el favicon SVG si no hay otro. Si un dato no existe, omítelo.",
          },
          {
            role: "user",
            content: `URL: ${url}\n\nHTML:\n${html}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_branding",
              description: "Devuelve el logo y la paleta de marca",
              parameters: {
                type: "object",
                properties: {
                  logo_url: { type: "string", description: "URL absoluta o relativa del logo principal" },
                  primary: { type: "string", description: "Color principal hex" },
                  secondary: { type: "string" },
                  accent: { type: "string" },
                  background: { type: "string" },
                  text: { type: "string" },
                  font_heading: { type: "string" },
                  font_body: { type: "string" },
                },
                required: [],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_branding" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 429) throw new Error("Límite de Lovable AI alcanzado, intenta en un momento.");
      if (aiRes.status === 402) throw new Error("Sin créditos de Lovable AI. Agrega saldo en Settings → Workspace → Usage.");
      throw new Error(`Error analizando branding (${aiRes.status}): ${t}`);
    }
    const aiJson = await aiRes.json();
    const args = aiJson.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("La IA no devolvió branding estructurado");
    let parsed: Record<string, string>;
    try { parsed = JSON.parse(args); } catch { throw new Error("Branding no parseable: " + args.slice(0, 200)); }

    const logo_url = parsed.logo_url ? absolutize(parsed.logo_url, url) : null;
    const colors = {
      primary: parsed.primary, secondary: parsed.secondary, accent: parsed.accent,
      background: parsed.background, text: parsed.text,
    };
    const fonts = { heading: parsed.font_heading, body: parsed.font_body };

    // 3) Save singleton
    const { error } = await supabaseAdmin
      .from("branding")
      .upsert({
        id: "default",
        website_url: url,
        logo_url,
        colors,
        fonts,
        raw: parsed,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error("No se pudo guardar branding: " + error.message);

    return { website_url: url, logo_url, colors, fonts };
  });
