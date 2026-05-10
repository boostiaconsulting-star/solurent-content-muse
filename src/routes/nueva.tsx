import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, RefreshCw, Sparkles, Plus, FileText, Image as ImageIcon, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";

import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ANGULOS,
  FORMATOS,
  REDES,
  type Archivo,
  supabase,
} from "@/lib/content-center";

export const Route = createFileRoute("/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva publicación · Solurent" },
      { name: "description", content: "Stepper de creación de contenido con IA." },
    ],
  }),
  component: NuevaPublicacion,
});

type ChatMsg = { role: "user" | "agent"; text: string };

const SAMPLE_IMAGE = "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=1200&q=80&auto=format&fit=crop";

function NuevaPublicacion() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // Step 1
  const [equipo, setEquipo] = useState("");
  const [idea, setIdea] = useState("");
  const [angulo, setAngulo] = useState<string>("Seguridad");
  const [formato, setFormato] = useState<string>("Imagen");
  const [redes, setRedes] = useState<string[]>(["Instagram"]);
  const [biblioteca, setBiblioteca] = useState<Archivo[]>([]);
  const [contexto, setContexto] = useState<string[]>([]);

  // Step 2
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Step 3 - generation
  const [generating, setGenerating] = useState(false);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [copyByRed, setCopyByRed] = useState<Record<string, string>>({});

  // Step 5
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("09:00");
  const [done, setDone] = useState(false);
  const [pubId, setPubId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("biblioteca")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Archivo[] | null }) => setBiblioteca((data ?? []) as Archivo[]));
  }, []);

  // Initialize chat when entering step 2
  useEffect(() => {
    if (step === 2 && chat.length === 0) {
      const archivosTxt = contexto.length
        ? `He revisado ${contexto.length} archivo(s) de tu biblioteca.`
        : "No adjuntaste contexto, trabajaré con lo que me diste.";
      setChat([
        {
          role: "agent",
          text: `Hola Raúl 👋. Vamos con una publicación de ${formato.toLowerCase()} para ${redes.join(", ")} sobre "${equipo || "tu equipo"}", ángulo ${angulo}. ${archivosTxt}\n\n¿Quieres resaltar alguna especificación técnica o beneficio puntual? También puedo proponer un prompt visual y copy listos para generar.`,
        },
      ]);
    }
  }, [step]);

  const toggleRed = (r: string) =>
    setRedes((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const toggleCtx = (id: string) =>
    setContexto((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const canStep1 = idea.trim().length > 3 && redes.length > 0;

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const userText = chatInput.trim();
    setChat((c) => [...c, { role: "user", text: userText }]);
    setChatInput("");
    setTimeout(() => {
      setChat((c) => [
        ...c,
        {
          role: "agent",
          text: `Perfecto. Propuesta de prompt visual:\n"${equipo || "Equipo"} en uso real, iluminación natural, ángulo ${angulo.toLowerCase()}, estética premium para ${redes[0] || "redes"}".\n\nCopy base: "${idea.slice(0, 80)}..." — adaptable por red. ¿Generamos?`,
        },
      ]);
    }, 700);
  };

  const generar = async () => {
    setStep(3);
    setGenerating(true);
    // Simulated Higgsfield generation
    await new Promise((r) => setTimeout(r, 2200));
    setImagenUrl(SAMPLE_IMAGE);
    const base = idea.trim() || `${equipo} con ángulo ${angulo}`;
    const copies: Record<string, string> = {};
    for (const r of redes) {
      if (r === "Instagram")
        copies[r] = `✨ ${base}\n\n#Solurent #${angulo.replace("/", "")} #EquiposEnRenta`;
      else if (r === "Facebook")
        copies[r] = `${base}\n\nEn Solurent rentamos equipo con respaldo, garantía y servicio. Cotiza hoy 👉`;
      else if (r === "TikTok")
        copies[r] = `POV: necesitas ${equipo || "el equipo correcto"} y Solurent llega 🚀\n${base}\n#fyp #solurent`;
      else copies[r] = `${equipo || "Equipo"} | ${angulo}\n${base}`;
    }
    setCopyByRed(copies);
    setGenerating(false);
    setStep(4);
  };

  const aprobarYProgramar = () => setStep(5);

  const guardarYEnviar = async () => {
    const fechaProgramada = fecha
      ? new Date(`${fecha}T${hora}:00`).toISOString()
      : null;

    const { data, error } = await supabase
      .from("publicaciones")
      .insert({
        equipo,
        idea,
        angulo,
        formato,
        redes,
        copy: copyByRed,
        imagen_url: imagenUrl,
        fecha_programada: fechaProgramada,
        estado: "aprobado",
      })
      .select()
      .single();

    if (error) {
      toast.error("No se pudo guardar: " + error.message);
      return;
    }

    if (contexto.length && data) {
      await supabase
        .from("publicacion_contexto")
        .insert(contexto.map((archivo_id) => ({ publicacion_id: data.id, archivo_id })));
    }

    setPubId(data.id);
    setDone(true);
    toast.success("Enviado a Zernio para publicación");
  };

  const setQuickDate = (d: Date, h = "09:00") => {
    const iso = d.toISOString().slice(0, 10);
    setFecha(iso);
    setHora(h);
  };

  const fechaResumen = useMemo(() => {
    if (!fecha) return "Sin fecha";
    return `${fecha} a las ${hora}`;
  }, [fecha, hora]);

  if (done) {
    return (
      <div className="max-w-2xl mx-auto p-6 md:p-10">
        <Card className="text-center py-12">
          <CardContent className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-success/10 grid place-items-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h2 className="text-2xl font-semibold">¡Listo!</h2>
            <p className="text-muted-foreground">
              Tu publicación fue enviada a Zernio y se publicará el {fechaResumen} en{" "}
              {redes.join(", ")}.
            </p>
            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => {
                  setStep(1);
                  setDone(false);
                  setPubId(null);
                  setIdea("");
                  setEquipo("");
                  setChat([]);
                  setImagenUrl(null);
                  setCopyByRed({});
                  setContexto([]);
                  setFecha("");
                }}
              >
                <Plus className="h-4 w-4 mr-2" /> Nueva publicación
              </Button>
              <Button variant="outline" onClick={() => navigate({ to: "/" })}>
                Ver publicaciones
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Nueva publicación</h1>
        <p className="text-muted-foreground">Sigue los 5 pasos para generar y programar tu contenido.</p>
      </header>
      <Stepper current={step} />

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Idea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label>Equipo o producto</Label>
              <Input
                placeholder="Ej: Generador eléctrico 25 kVA"
                value={equipo}
                onChange={(e) => setEquipo(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Instrucción / idea de la publicación</Label>
              <Textarea
                rows={4}
                placeholder="Describe el mensaje, oferta o angulo concreto…"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="grid gap-2">
                <Label>Ángulo</Label>
                <Select value={angulo} onValueChange={setAngulo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ANGULOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Formato</Label>
                <Select value={formato} onValueChange={setFormato}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMATOS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Redes</Label>
              <div className="flex flex-wrap gap-2">
                {REDES.map((r) => {
                  const active = redes.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRed(r)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Adjuntar contexto (Biblioteca)</Label>
              {biblioteca.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no tienes archivos. Súbelos en la sección Biblioteca.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {biblioteca.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={contexto.includes(a.id)}
                        onCheckedChange={() => toggleCtx(a.id)}
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        {a.tipo === "pdf" ? (
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm truncate">{a.nombre}</div>
                          <div className="text-xs text-muted-foreground">{a.categoria}</div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button disabled={!canStep1} onClick={() => setStep(2)}>
                Refinar con el agente <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Refinar con el agente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[420px] overflow-y-auto p-1">
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.role === "agent" && (
                      <div className="text-xs font-medium opacity-70 mb-1 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Agente
                      </div>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Input
                placeholder="Escribe tu respuesta…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
              />
              <Button variant="outline" onClick={sendChat}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex justify-between pt-6">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Atrás
              </Button>
              <Button onClick={generar}>
                Generar contenido <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h3 className="text-lg font-medium">Generando con Higgsfield…</h3>
            <p className="text-sm text-muted-foreground">
              Esto puede tomar unos segundos.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Aprobar contenido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl overflow-hidden border bg-muted aspect-video">
              {imagenUrl && (
                <img
                  src={imagenUrl}
                  alt="Generado"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <Tabs defaultValue={redes[0]}>
              <TabsList>
                {redes.map((r) => (
                  <TabsTrigger key={r} value={r}>{r}</TabsTrigger>
                ))}
              </TabsList>
              {redes.map((r) => (
                <TabsContent key={r} value={r} className="pt-3">
                  <Textarea
                    rows={6}
                    value={copyByRed[r] || ""}
                    onChange={(e) =>
                      setCopyByRed((p) => ({ ...p, [r]: e.target.value }))
                    }
                  />
                </TabsContent>
              ))}
            </Tabs>
            <div className="flex justify-between">
              <Button variant="outline" onClick={generar} disabled={generating}>
                <RefreshCw className="h-4 w-4 mr-2" /> Regenerar
              </Button>
              <Button onClick={aprobarYProgramar} className="bg-success hover:bg-success/90 text-success-foreground">
                Aprobar y programar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Programar publicación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fecha</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Hora</Label>
                <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickDate(new Date(), "09:00")}>
                Hoy 9am
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(); d.setDate(d.getDate() + 1); setQuickDate(d, "09:00");
              }}>
                Mañana 9am
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const d = new Date(); d.setDate(d.getDate() + 5); setQuickDate(d, "09:00");
              }}>
                Esta semana
              </Button>
            </div>
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="text-sm text-muted-foreground mb-2">Resumen</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {redes.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
              </div>
              <div className="text-sm">{fechaResumen}</div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(4)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Atrás
              </Button>
              <Button onClick={guardarYEnviar} disabled={!fecha}>
                Enviar a Zernio → publicar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
