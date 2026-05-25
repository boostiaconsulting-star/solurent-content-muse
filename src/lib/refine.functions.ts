import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readEnv } from "@/lib/env";

type ChatRole = "user" | "agent";
type ChatMsg = { role: ChatRole; text: string };

type RefineInitial = {
  equipo: string;
  idea: string;
  angulo: string;
  formato: string;
  redes: string[];
  contextoTitulos?: string[];
};

type RefineInput = {
  initial: RefineInitial;
  conversation: ChatMsg[];
};

type BrandCtx = { colors?: Record<string, string> | null } | null;

async function loadBranding(): Promise<BrandCtx> {
  try {
    const { data } = await supabaseAdmin
      .from("branding").select("colors").eq("id", "default").maybeSingle();
    return (data ?? null) as BrandCtx;
  } catch {
    return null;
  }
}

function brandLine(brand: BrandCtx): string {
  if (!brand?.colors) return "";
  const palette = Object.entries(brand.colors)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  return palette ? `\nPaleta de marca (referencia, no obligatoria): ${palette}.` : "";
}

function buildContextBlock(initial: RefineInitial, brand: BrandCtx): string {
  const archivos = initial.contextoTitulos?.length
    ? `\n- Archivos de referencia adjuntos: ${initial.contextoTitulos.join(", ")}`
    : "";
  return `Contexto inicial de la publicación:
- Equipo/producto: ${initial.equipo || "sin especificar"}
- Idea/mensaje principal: ${initial.idea}
- Ángulo: ${initial.angulo}
- Formato: ${initial.formato}
- Redes: ${initial.redes.join(", ")}${archivos}${brandLine(brand)}`;
}

type ClaudeMsg = { role: "user" | "assistant"; content: string };

function toClaudeMessages(initial: RefineInitial, conversation: ChatMsg[], brand: BrandCtx): ClaudeMsg[] {
  const seed: ClaudeMsg = {
    role: "user",
    content: `${buildContextBlock(initial, brand)}\n\nVamos a refinar esta idea antes de generar la imagen y el copy.`,
  };
  const rest: ClaudeMsg[] = conversation.slice(-16).map((m) => ({
    role: m.role === "agent" ? "assistant" : "user",
    content: m.text,
  }));
  return [seed, ...rest];
}

const REFINE_SYSTEM = `Eres un asistente creativo de Solurent (renta de equipos industriales en México). Ayudas al equipo de marketing a refinar la idea de una publicación antes de generar la imagen y el copy.

Reglas:
- Responde siempre en español neutro de México.
- Sé breve: 1-3 frases por turno, sin emojis innecesarios.
- Haz UNA pregunta a la vez, enfocada y útil (escena visual, beneficios concretos, dato técnico relevante, audiencia, contexto de uso).
- No inventes especificaciones del equipo. Si dudas, pregunta.
- Cuando ya tengas información suficiente para una publicación sólida, ofrece cerrar con: "Creo que tenemos buen material — dale a 'Generar contenido' cuando quieras."`;

const CONSOLIDATE_SYSTEM = `Eres un copywriter senior de Solurent. Consolidas una conversación de brainstorming en una idea refinada y notas de contexto para alimentar a un generador de imagen (Gemini) y un generador de copy (Claude).

Responde ÚNICAMENTE con un objeto JSON válido, sin texto extra, sin bloques de código, con esta forma exacta:
{
  "ideaRefinada": "...",
  "contextoExtra": "..."
}

Reglas:
- "ideaRefinada": versión mejorada y específica del mensaje principal incorporando insights de la conversación. 1-3 frases, concreta, español neutro de México.
- "contextoExtra": detalles útiles para la generación (escena visual, tono, beneficios, ángulo emocional, datos del equipo que surgieron). 1-2 frases. Cadena vacía si no hay nada relevante.
- No inventes datos técnicos del equipo. Si la conversación no aportó cambios, devuelve la idea original tal cual y "contextoExtra" vacío.`;

async function callClaude(system: string, messages: ClaudeMsg[], maxTokens: number): Promise<string> {
  const key = readEnv("ANTHROPIC_API_KEY") ?? readEnv("Anthropic_API_Key");
  if (!key) throw new Error("ANTHROPIC_API_KEY no configurada");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Error con Claude (${res.status}): ${t}`);
  }
  const json = await res.json();
  const text: string = json.content?.[0]?.text ?? "";
  if (!text) throw new Error("Claude devolvió respuesta vacía");
  return text;
}

/** Conversational refinement: one turn of the agent given the running chat. */
export const refineChat = createServerFn({ method: "POST" })
  .inputValidator((d: RefineInput) => d)
  .handler(async ({ data }) => {
    const brand = await loadBranding();
    const messages = toClaudeMessages(data.initial, data.conversation, brand);
    const reply = await callClaude(REFINE_SYSTEM, messages, 400);
    return { reply: reply.trim() };
  });

/** Consolidates the whole conversation into a refined idea + extra context for generation. */
export const refinePrompt = createServerFn({ method: "POST" })
  .inputValidator((d: RefineInput) => d)
  .handler(async ({ data }) => {
    const userTurns = data.conversation.filter((m) => m.role === "user");
    if (userTurns.length === 0) {
      return { ideaRefinada: data.initial.idea, contextoExtra: "" };
    }

    const brand = await loadBranding();
    const messages = toClaudeMessages(data.initial, data.conversation, brand);
    messages.push({
      role: "user",
      content: "Con base en todo lo anterior, devuelve el JSON consolidado con ideaRefinada y contextoExtra.",
    });
    const text = await callClaude(CONSOLIDATE_SYSTEM, messages, 600);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Consolidación sin JSON: " + text.slice(0, 200));
    let parsed: { ideaRefinada?: string; contextoExtra?: string };
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      throw new Error("JSON inválido en consolidación: " + (e as Error).message);
    }
    return {
      ideaRefinada: parsed.ideaRefinada?.trim() || data.initial.idea,
      contextoExtra: parsed.contextoExtra?.trim() ?? "",
    };
  });
