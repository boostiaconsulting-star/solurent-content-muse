import { createServerFn } from "@tanstack/react-start";

export const sendToMake = createServerFn({ method: "POST" })
  .inputValidator((d: {
    imagen_url: string | null;
    copy: Record<string, string>;
    redes: string[];
    fecha: string | null;
    equipo: string;
  }) => d)
  .handler(async ({ data }) => {
    const url = process.env.MAKE_WEBHOOK_URL;
    if (!url) throw new Error("MAKE_WEBHOOK_URL no configurado");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Webhook Make falló (${res.status}): ${txt.slice(0, 200)}`);
    }
    return { ok: true };
  });
