import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readEnv } from "@/lib/env";

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

/** Fetch site HTML and extract logo URL + brand colors via Google Gemini. */
export const analyzeBranding = createServerFn({ method: "POST" })
  .inputValidator((d: { website_url: string }) => d)
  .handler(async ({ data }) => {
    const GOOGLE_API_KEY = readEnv("GOOGLE_API_KEY");
    if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY no configurada");

    const url = data.website_url.startsWith("http") ? data.website_url : `https://${data.website_url}`;

    // 1) Fetch HTML
    const htmlRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 SolurentBot/1.0" } });
    if (!htmlRes.ok) throw new Error(`No se pudo abrir ${url} (${htmlRes.status})`);
    const html = (await htmlRes.text()).slice(0, 200_000); // cap

    // 2) Ask Gemini to extract structured branding via native function calling
    const systemInstruction =
      "Eres un experto en branding. Analiza el HTML de un sitio web y extrae el logo y la paleta de marca. Responde SOLO llamando a la función extract_branding. Para los colores devuelve hex (#RRGGBB). Para el logo prefiere un <img> en el header con palabras 'logo' o el favicon SVG si no hay otro. Si un dato no existe, omítelo.";

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`;
    const aiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: `URL: ${url}\n\nHTML:\n${html}` }] }],
        tools: [
          {
            functionDeclarations: [
              {
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
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["extract_branding"] },
        },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      if (aiRes.status === 401 || aiRes.status === 403) throw new Error("Credenciales de Google AI inválidas.");
      if (aiRes.status === 429) throw new Error("Límite de Google AI alcanzado, intenta en un momento.");
      throw new Error(`Error analizando branding (${aiRes.status}): ${t}`);
    }
    const aiJson = await aiRes.json();
    const candidateParts: Array<Record<string, any>> = aiJson.candidates?.[0]?.content?.parts ?? [];
    const fnCall = candidateParts.find((p) => p.functionCall?.name === "extract_branding")?.functionCall;
    if (!fnCall?.args) throw new Error("La IA no devolvió branding estructurado");
    const parsed = fnCall.args as Record<string, string>;

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
