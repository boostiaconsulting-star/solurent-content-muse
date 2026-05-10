import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase, type Publicacion } from "@/lib/content-center";

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Calendario · Solurent" },
      { name: "description", content: "Publicaciones programadas." },
    ],
  }),
  component: Calendario,
});

function Calendario() {
  const [items, setItems] = useState<Publicacion[]>([]);

  useEffect(() => {
    supabase
      .from("publicaciones")
      .select("*")
      .not("fecha_programada", "is", null)
      .order("fecha_programada", { ascending: true })
      .then(({ data }: { data: Publicacion[] | null }) => setItems((data ?? []) as Publicacion[]));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Publicacion[]>();
    for (const p of items) {
      if (!p.fecha_programada) continue;
      const key = new Date(p.fecha_programada).toLocaleDateString("es-MX", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Calendario</h1>
        <p className="text-muted-foreground">Publicaciones programadas en orden cronológico.</p>
      </header>

      {grouped.length === 0 ? (
        <p className="text-muted-foreground">No hay publicaciones programadas.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, pubs]) => (
            <div key={day}>
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">
                {day}
              </h3>
              <div className="space-y-2">
                {pubs.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="text-sm font-medium w-16">
                        {new Date(p.fecha_programada!).toLocaleTimeString("es-MX", {
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.equipo}</div>
                        <div className="text-sm text-muted-foreground truncate">{p.idea}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(p.redes ?? []).map((r) => (
                          <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
