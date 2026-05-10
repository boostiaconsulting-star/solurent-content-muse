import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, CalendarClock, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase, type Publicacion } from "@/lib/content-center";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Publicaciones · Solurent" },
      { name: "description", content: "Tus publicaciones generadas con IA." },
    ],
  }),
  component: Index,
});

function estadoColor(e: string) {
  if (e === "aprobado") return "bg-success text-success-foreground";
  if (e === "publicado") return "bg-primary text-primary-foreground";
  return "bg-muted text-foreground";
}

function Index() {
  const [items, setItems] = useState<Publicacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("publicaciones")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Publicacion[] | null }) => {
        setItems((data ?? []) as Publicacion[]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold">Publicaciones</h1>
          <p className="text-muted-foreground">Borradores, aprobados y programados.</p>
        </div>
        <Button asChild size="lg">
          <Link to="/nueva">
            <Plus className="h-4 w-4 mr-2" /> Nueva publicación
          </Link>
        </Button>
      </header>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-primary/10 grid place-items-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">Aún no hay publicaciones</h3>
            <p className="text-muted-foreground max-w-sm">
              Crea tu primera publicación con el agente y prográmala para tus redes.
            </p>
            <Button asChild className="mt-2">
              <Link to="/nueva">
                <Plus className="h-4 w-4 mr-2" /> Empezar
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              {p.imagen_url && (
                <div className="aspect-video bg-muted">
                  <img src={p.imagen_url} alt={p.equipo ?? ""} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge className={estadoColor(p.estado)}>{p.estado}</Badge>
                  <span className="text-xs text-muted-foreground">{p.formato}</span>
                </div>
                <h3 className="font-medium line-clamp-1">{p.equipo || "Sin equipo"}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">{p.idea}</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {(p.redes ?? []).map((r) => (
                    <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                  ))}
                </div>
                {p.fecha_programada && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                    <CalendarClock className="h-3 w-3" />
                    {new Date(p.fecha_programada).toLocaleString("es-MX")}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
