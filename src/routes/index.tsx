import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, CalendarClock, Sparkles, MoreVertical, Trash2, CalendarCog } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [toDelete, setToDelete] = useState<Publicacion | null>(null);
  const [toReschedule, setToReschedule] = useState<Publicacion | null>(null);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("09:00");

  const reload = () => {
    setLoading(true);
    supabase
      .from("publicaciones")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Publicacion[] | null }) => {
        setItems((data ?? []) as Publicacion[]);
        setLoading(false);
      });
  };

  useEffect(() => { reload(); }, []);

  const openReschedule = (p: Publicacion) => {
    if (p.fecha_programada) {
      const d = new Date(p.fecha_programada);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      setFecha(`${yyyy}-${mm}-${dd}`);
      setHora(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else {
      setFecha("");
      setHora("09:00");
    }
    setToReschedule(p);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("publicaciones").delete().eq("id", toDelete.id);
    if (error) {
      toast.error("No se pudo eliminar");
    } else {
      toast.success("Publicación eliminada");
      setItems((prev) => prev.filter((x) => x.id !== toDelete.id));
    }
    setToDelete(null);
  };

  const confirmReschedule = async () => {
    if (!toReschedule || !fecha) return;
    const iso = new Date(`${fecha}T${hora}:00`).toISOString();
    const { error } = await supabase
      .from("publicaciones")
      .update({ fecha_programada: iso, estado: "aprobado" })
      .eq("id", toReschedule.id);
    if (error) {
      toast.error("No se pudo reprogramar");
    } else {
      toast.success("Publicación reprogramada");
      setItems((prev) => prev.map((x) =>
        x.id === toReschedule.id ? { ...x, fecha_programada: iso, estado: "aprobado" } : x
      ));
    }
    setToReschedule(null);
  };

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
            <Card key={p.id} className="overflow-hidden relative group">
              {p.imagen_url && (
                <div className="aspect-video bg-muted relative group/img">
                  <img src={p.imagen_url} alt={p.equipo ?? ""} className="w-full h-full object-cover" />
                  <MediaActions
                    url={p.imagen_url}
                    caption={`${p.equipo ?? ""} · ${p.angulo ?? ""}`}
                    className="absolute bottom-2 left-2 opacity-0 group-hover/img:opacity-100 transition-opacity"
                  />
                </div>
              )}
              <div className="absolute top-2 right-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" className="h-8 w-8 shadow-sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openReschedule(p)}>
                      <CalendarCog className="h-4 w-4 mr-2" />
                      {p.fecha_programada ? "Reprogramar" : "Programar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setToDelete(p)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar publicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente "{toDelete?.equipo || "esta publicación"}". Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!toReschedule} onOpenChange={(o) => !o && setToReschedule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {toReschedule?.fecha_programada ? "Reprogramar publicación" : "Programar publicación"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hora">Hora</Label>
              <Input id="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToReschedule(null)}>Cancelar</Button>
            <Button onClick={confirmReschedule} disabled={!fecha}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
