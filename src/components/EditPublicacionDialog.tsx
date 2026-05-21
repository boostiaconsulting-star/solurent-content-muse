import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Send, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { type Publicacion } from "@/lib/content-center";
import { generateImage } from "@/lib/generate.functions";
import { updatePublicacion } from "@/lib/db.functions";

type ChatMsg = { role: "user" | "agent"; text: string };

export function EditPublicacionDialog({
  publicacion,
  onClose,
  onSaved,
}: {
  publicacion: Publicacion | null;
  onClose: () => void;
  onSaved: (p: Publicacion) => void;
}) {
  const callImage = useServerFn(generateImage);
  const updatePublicacionFn = useServerFn(updatePublicacion);
  const open = !!publicacion;

  const [copy, setCopy] = useState<Record<string, string>>(publicacion?.copy ?? {});
  const [imagenUrl, setImagenUrl] = useState<string | null>(publicacion?.imagen_url ?? null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!publicacion) return;
    setCopy(publicacion.copy ?? {});
    setImagenUrl(publicacion.imagen_url ?? null);
    setChat([{
      role: "agent",
      text: `Estoy aquí para ajustar "${publicacion.equipo || "esta publicación"}". Dime qué quieres cambiar de la imagen (estilo, escena, colores, ángulo) y la regenero.`,
    }]);
    setChatInput("");
  }, [publicacion?.id]);

  if (!publicacion) return null;

  const redes = publicacion.redes ?? [];

  const enviarPrompt = async () => {
    const instr = chatInput.trim();
    if (!instr) return;
    setChat((c) => [...c, { role: "user", text: instr }]);
    setChatInput("");
    setRegenerating(true);
    setChat((c) => [...c, { role: "agent", text: "Regenerando imagen con tus instrucciones…" }]);
    try {
      const { url } = await callImage({
        data: {
          equipo: publicacion.equipo ?? "",
          idea: publicacion.idea ?? "",
          angulo: publicacion.angulo ?? "",
          formato: publicacion.formato ?? "Imagen",
          redes,
          instrucciones: instr,
          referenceImageUrls: imagenUrl ? [imagenUrl] : undefined,
        },
      });
      if (url) {
        setImagenUrl(url);
        setChat((c) => [...c, { role: "agent", text: "Listo, imagen actualizada. ¿Otro ajuste o guardo?" }]);
      }
    } catch (e) {
      setChat((c) => [...c, { role: "agent", text: "Error: " + (e as Error).message }]);
      toast.error((e as Error).message);
    } finally {
      setRegenerating(false);
    }
  };

  const guardar = async () => {
    setSaving(true);
    try {
      await updatePublicacionFn({
        data: { id: publicacion.id, patch: { copy, imagen_url: imagenUrl } },
      });
      toast.success("Cambios guardados");
      onSaved({ ...publicacion, copy, imagen_url: imagenUrl });
      onClose();
    } catch (e) {
      toast.error("No se pudo guardar: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar publicación</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="copy" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="copy">Copy</TabsTrigger>
            <TabsTrigger value="imagen">Imagen</TabsTrigger>
          </TabsList>

          <TabsContent value="copy" className="space-y-4 mt-4">
            {redes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin redes asociadas.</p>
            ) : (
              redes.map((r) => (
                <div key={r} className="space-y-2">
                  <Label>{r}</Label>
                  <Textarea
                    rows={5}
                    value={copy[r] ?? ""}
                    onChange={(e) => setCopy((p) => ({ ...p, [r]: e.target.value }))}
                  />
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="imagen" className="space-y-4 mt-4">
            {imagenUrl ? (
              <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                <img src={imagenUrl} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="aspect-video rounded-lg bg-muted grid place-items-center text-sm text-muted-foreground">
                Sin imagen
              </div>
            )}

            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Chat para regenerar la imagen
              </div>
              <div className="max-h-56 overflow-y-auto space-y-2 text-sm">
                {chat.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "text-right" : ""}>
                    <span className={`inline-block px-3 py-2 rounded-lg ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border"
                    }`}>
                      {m.text}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  placeholder="Ej: hazla más oscura, escena de obra, agrega un técnico operando…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarPrompt(); }
                  }}
                  disabled={regenerating}
                />
                <Button onClick={enviarPrompt} disabled={regenerating || !chatInput.trim()}>
                  {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Cada mensaje regenera la imagen usando la actual como referencia.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

