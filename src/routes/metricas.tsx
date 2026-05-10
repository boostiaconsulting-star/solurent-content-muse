import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase, type Publicacion } from "@/lib/content-center";
import { BarChart3, CheckCircle2, Clock, Send } from "lucide-react";

export const Route = createFileRoute("/metricas")({
  head: () => ({
    meta: [
      { title: "Métricas · Solurent" },
      { name: "description", content: "Resumen de actividad." },
    ],
  }),
  component: Metricas,
});

function Metricas() {
  const [items, setItems] = useState<Publicacion[]>([]);

  useEffect(() => {
    supabase
      .from("publicaciones")
      .select("*")
      .then(({ data }: { data: Publicacion[] | null }) => setItems((data ?? []) as Publicacion[]));
  }, []);

  const stats = useMemo(() => {
    const total = items.length;
    const aprobadas = items.filter((p) => p.estado === "aprobado").length;
    const programadas = items.filter((p) => p.fecha_programada).length;
    const porRed: Record<string, number> = {};
    for (const p of items) for (const r of p.redes ?? []) porRed[r] = (porRed[r] ?? 0) + 1;
    return { total, aprobadas, programadas, porRed };
  }, [items]);

  const cards = [
    { label: "Publicaciones totales", value: stats.total, icon: BarChart3 },
    { label: "Aprobadas", value: stats.aprobadas, icon: CheckCircle2 },
    { label: "Programadas", value: stats.programadas, icon: Clock },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Métricas</h1>
        <p className="text-muted-foreground">Visión general de tu actividad.</p>
      </header>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{c.label}</div>
                <div className="text-3xl font-semibold">{c.value}</div>
              </div>
              <c.icon className="h-8 w-8 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Distribución por red social
          </h3>
          {Object.keys(stats.porRed).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos aún.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.porRed)
                .sort((a, b) => b[1] - a[1])
                .map(([red, n]) => {
                  const max = Math.max(...Object.values(stats.porRed));
                  const pct = (n / max) * 100;
                  return (
                    <div key={red}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{red}</span>
                        <span className="text-muted-foreground">{n}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
