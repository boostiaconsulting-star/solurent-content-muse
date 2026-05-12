import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload, FileText, Image as ImageIcon, Eye, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase, type Archivo, CATEGORIAS } from "@/lib/content-center";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "Biblioteca · Solurent" },
      { name: "description", content: "Archivos de contexto para tus publicaciones." },
    ],
  }),
  component: Biblioteca,
});

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function Biblioteca() {
  const [items, setItems] = useState<Archivo[]>([]);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0]);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Archivo | null>(null);

  const load = () => {
    supabase
      .from("biblioteca")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Archivo[] | null }) => setItems((data ?? []) as Archivo[]));
  };
  useEffect(load, []);

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setUploading(true);
    try {
      // Ensure bucket exists (best-effort).
      try {
        await supabase.storage.createBucket("biblioteca", { public: true });
      } catch {
        /* ignore if exists */
      }

      for (const file of arr) {
        if (!ACCEPTED.includes(file.type)) {
          toast.error(`Tipo no permitido: ${file.name}`);
          continue;
        }
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("biblioteca").upload(path, file);
        if (error) {
          toast.error("Error subiendo " + file.name + ": " + error.message);
          continue;
        }
        const { data: pub } = supabase.storage.from("biblioteca").getPublicUrl(path);
        const tipo = file.type === "application/pdf" ? "pdf" : "imagen";
        const { error: insErr } = await supabase.from("biblioteca").insert({
          nombre: file.name,
          tipo,
          categoria,
          url: pub.publicUrl,
        });
        if (insErr) toast.error(insErr.message);
      }
      toast.success("Archivos subidos");
      load();
    } finally {
      setUploading(false);
    }
  };

  const remove = async (a: Archivo) => {
    await supabase.from("biblioteca").delete().eq("id", a.id);
    // try to remove file too
    const path = a.url.split("/biblioteca/")[1];
    if (path) await supabase.storage.from("biblioteca").remove([path]);
    toast.success("Eliminado");
    load();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Biblioteca</h1>
        <p className="text-muted-foreground">Archivos de contexto para tus publicaciones.</p>
      </header>

      <Card className="mb-8">
        <CardContent className="p-5 space-y-4">
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="grid gap-2">
              <Label>Categoría al subir</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Subiendo…" : "Subir archivos"}
            </Button>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault(); setDrag(false);
              if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
              drag ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
            }`}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Arrastra archivos aquí o haz click. PDF, JPG, PNG, WEBP.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <p className="text-muted-foreground">Aún no subes archivos.</p>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((a) => (
            <Card key={a.id} className="overflow-hidden group relative">
              <button
                type="button"
                onClick={() => setPreview(a)}
                className="aspect-square bg-muted grid place-items-center overflow-hidden w-full hover:opacity-90 transition relative"
                title="Vista previa"
              >
                {a.tipo === "imagen" ? (
                  <img src={a.url} alt={a.nombre} className="w-full h-full object-cover" />
                ) : (
                  <FileText className="h-14 w-14 text-primary" />
                )}
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Eye className="h-6 w-6 text-white" />
                </span>
              </button>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-start gap-2">
                  {a.tipo === "imagen" ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="text-sm truncate" title={a.nombre}>{a.nombre}</div>
                </div>
                <div className="text-xs text-muted-foreground">{a.categoria}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString("es-MX")}
                </div>
                <div className="flex gap-1 mt-1">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => setPreview(a)}>
                    <Eye className="h-4 w-4 mr-1" /> Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={() => remove(a)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.nombre}</DialogTitle>
            <p className="text-xs text-muted-foreground">{preview?.categoria}</p>
          </DialogHeader>
          <div className="flex-1 min-h-[60vh] bg-muted rounded-md overflow-hidden">
            {preview?.tipo === "pdf" ? (
              <iframe src={preview.url} title={preview.nombre} className="w-full h-full min-h-[60vh]" />
            ) : preview ? (
              <img src={preview.url} alt={preview.nombre} className="w-full h-full object-contain" />
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => preview && window.open(preview.url, "_blank")}
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Abrir en pestaña
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (preview) {
                    remove(preview);
                    setPreview(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar
              </Button>
              <Button onClick={() => setPreview(null)}>Cerrar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
