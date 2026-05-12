import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Send, RefreshCw, Sparkles, Plus, FileText, Image as ImageIcon,
  ArrowRight, ArrowLeft, CheckCircle2, Upload, Video as VideoIcon, X, Wand2, FileUp,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import {
  ANGULOS, FORMATOS, REDES, type Archivo, supabase,
} from "@/lib/content-center";
import { generateImage, generateCopies } from "@/lib/generate.functions";

export const Route = createFileRoute("/nueva")({
  head: () => ({
    meta: [
      { title: "Nueva publicación · Solurent" },
      { name: "description", content: "Stepper de creación de contenido con IA o subiendo tu propio material." },
    ],
  }),
  component: NuevaPublicacion,
});

type ChatMsg = { role: "user" | "agent"; text: string };
type Origen = "ia" | "contenido_propio";

const SAMPLE_IMAGE = "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=1200&q=80&auto=format&fit=crop";
const VIDEO_MAX = 500 * 1024 * 1024;
const IMG_MAX = 50 * 1024 * 1024;

function NuevaPublicacion() {
  const navigate = useNavigate();
  const [origen, setOrigen] = useState<Origen>("ia");
  const [step, setStep] = useState(1);

  // Common
  const [equipo, setEquipo] = useState("");
  const [idea, setIdea] = useState("");
  const [angulo, setAngulo] = useState<string>("Seguridad");
  const [formato, setFormato] = useState<string>("Imagen");
  const [redes, setRedes] = useState<string[]>(["Instagram"]);
  const [biblioteca, setBiblioteca] = useState<Archivo[]>([]);
  const [contexto, setContexto] = useState<string[]>([]);

  // Upload (contenido_propio)
  const [contextoExtra, setContextoExtra] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadTipo, setUploadTipo] = useState<"video" | "imagen" | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  // Step 2 chat (only IA flow)
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");

  // Generation
  const [generating, setGenerating] = useState(false);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [copyByRed, setCopyByRed] = useState<Record<string, string>>({});

  // Schedule
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("09:00");
  const [done, setDone] = useState(false);

  // Effective steps mapping (own content uses 4 conceptual steps shown in stepper as 1..4 of 5? we keep 5-step stepper but skip "Refinar")
  // For simplicity we keep 5 steps in stepper for IA and 4 distinct for own content, mapped onto stepper as: 1 Subir, 2 Generar copy, 3 Aprobar, 4 Programar.
  const STEPPER_TOTAL = 5;
  const stepperCurrent = origen === "ia" ? step : (
    step === 1 ? 1 : step === 3 ? 2 : step === 4 ? 3 : step === 5 ? 4 : step
  );

  useEffect(() => {
    supabase
      .from("biblioteca")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }: { data: Archivo[] | null }) => setBiblioteca((data ?? []) as Archivo[]));
  }, []);

  useEffect(() => {
    if (origen === "ia" && step === 2 && chat.length === 0) {
      const archivosTxt = contexto.length
        ? `He revisado ${contexto.length} archivo(s) de tu biblioteca.`
        : "No adjuntaste contexto, trabajaré con lo que me diste.";
      setChat([{
        role: "agent",
        text: `Hola Raúl 👋. Vamos con una publicación de ${formato.toLowerCase()} para ${redes.join(", ")} sobre "${equipo || "tu equipo"}", ángulo ${angulo}. ${archivosTxt}\n\n¿Quieres resaltar alguna especificación o beneficio puntual?`,
      }]);
    }
  }, [step, origen]);

  const toggleRed = (r: string) =>
    setRedes((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  const toggleCtx = (id: string) =>
    setContexto((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const canStep1IA = idea.trim().length > 3 && redes.length > 0;
  const canStep1Upload = !!uploadedUrl && redes.length > 0 && equipo.trim().length > 0;

  // ---------- Upload ----------
  const handleFile = async (file: File) => {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast.error("Formato no soportado. Usa MP4/MOV/AVI o JPG/PNG/WEBP.");
      return;
    }
    if (isVideo && file.size > VIDEO_MAX) { toast.error("El video supera 500MB."); return; }
    if (isImage && file.size > IMG_MAX) { toast.error("La imagen supera 50MB."); return; }

    const tipo = isVideo ? "video" : "imagen";
    setUploadFile(file);
    setUploadTipo(tipo);
    setUploadPreview(URL.createObjectURL(file));
    setUploading(true);

    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("contenido_propio")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      toast.error("No se pudo subir: " + error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("contenido_propio").getPublicUrl(path);
    setUploadedUrl(data.publicUrl);
    setUploading(false);
    toast.success("Archivo subido");
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const clearUpload = () => {
    setUploadFile(null); setUploadPreview(null); setUploadTipo(null); setUploadedUrl(null);
  };

  // ---------- Chat ----------
  const sendChat = () => {
    if (!chatInput.trim()) return;
    const userText = chatInput.trim();
    setChat((c) => [...c, { role: "user", text: userText }]);
    setChatInput("");
    setTimeout(() => {
      setChat((c) => [...c, {
        role: "agent",
        text: `Perfecto. Propuesta de prompt visual:\n"${equipo || "Equipo"} en uso real, iluminación natural, ángulo ${angulo.toLowerCase()}, estética premium para ${redes[0] || "redes"}".\n\nCopy base: "${idea.slice(0, 80)}..." — adaptable por red. ¿Generamos?`,
      }]);
    }, 700);
  };

  // ---------- Copy generation (used by both flows) ----------
  const buildCopies = () => {
    const base = idea.trim() || contextoExtra.trim() || `${equipo} con ángulo ${angulo}`;
    const copies: Record<string, string> = {};
    for (const r of redes) {
      if (r === "Instagram") copies[r] = `✨ ${base}\n\n#Solurent #${angulo.replace("/", "")} #EquiposEnRenta`;
      else if (r === "Facebook") copies[r] = `${base}\n\nEn Solurent rentamos equipo con respaldo, garantía y servicio. Cotiza hoy 👉`;
      else if (r === "TikTok") copies[r] = `POV: necesitas ${equipo || "el equipo correcto"} y Solurent llega 🚀\n${base}\n#fyp #solurent`;
      else copies[r] = `${equipo || "Equipo"} | ${angulo}\n${base}`;
    }
    return copies;
  };

  // IA: generate image+copy
  const generarIA = async () => {
    setStep(3); setGenerating(true);
    await new Promise((r) => setTimeout(r, 2200));
    setImagenUrl(SAMPLE_IMAGE);
    setCopyByRed(buildCopies());
    setGenerating(false);
    setStep(4);
  };

  // Own content: generate copy only (step 3)
  const generarCopyPropio = async () => {
    setStep(3); setGenerating(true);
    await new Promise((r) => setTimeout(r, 1400));
    setCopyByRed(buildCopies());
    setGenerating(false);
    setStep(4);
  };

  const aprobarYProgramar = () => setStep(5);

  const guardarYEnviar = async () => {
    const fechaProgramada = fecha ? new Date(`${fecha}T${hora}:00`).toISOString() : null;

    const payload: Record<string, unknown> = {
      equipo, idea: origen === "ia" ? idea : contextoExtra,
      angulo, formato: origen === "ia" ? formato : (uploadTipo === "video" ? "Video" : "Imagen"),
      redes, copy: copyByRed,
      imagen_url: origen === "ia" ? imagenUrl : null,
      fecha_programada: fechaProgramada,
      estado: "aprobado",
      origen,
      contenido_url: origen === "contenido_propio" ? uploadedUrl : null,
      contenido_tipo: origen === "contenido_propio" ? uploadTipo : null,
    };

    const { data, error } = await supabase.from("publicaciones").insert(payload).select().single();
    if (error) { toast.error("No se pudo guardar: " + error.message); return; }

    if (contexto.length && data) {
      await supabase.from("publicacion_contexto")
        .insert(contexto.map((archivo_id) => ({ publicacion_id: data.id, archivo_id })));
    }

    setDone(true);
    toast.success("Enviado a Zernio para publicación");
  };

  const setQuickDate = (d: Date, h = "09:00") => {
    setFecha(d.toISOString().slice(0, 10)); setHora(h);
  };

  const fechaResumen = useMemo(() => fecha ? `${fecha} a las ${hora}` : "Sin fecha", [fecha, hora]);

  const resetAll = () => {
    setStep(1); setDone(false); setIdea(""); setEquipo(""); setChat([]);
    setImagenUrl(null); setCopyByRed({}); setContexto([]); setFecha("");
    setContextoExtra(""); clearUpload(); setOrigen("ia");
  };

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
              Tu publicación fue enviada a Zernio y se publicará el {fechaResumen} en {redes.join(", ")}.
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={resetAll}><Plus className="h-4 w-4 mr-2" /> Nueva publicación</Button>
              <Button variant="outline" onClick={() => navigate({ to: "/" })}>Ver publicaciones</Button>
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
        <p className="text-muted-foreground">Genera con IA o sube tu propio contenido.</p>
      </header>
      <Stepper current={stepperCurrent} />

      {/* STEP 1 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{origen === "ia" ? "Idea" : "Subir contenido"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Origen selector */}
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                { id: "ia", title: "Generar con IA", desc: "Crea imagen y copy desde una idea.", icon: Wand2 },
                { id: "contenido_propio", title: "Subir mi contenido", desc: "Usa un video o imagen propio.", icon: FileUp },
              ] as const).map((opt) => {
                const Icon = opt.icon; const active = origen === opt.id;
                return (
                  <button key={opt.id} type="button" onClick={() => setOrigen(opt.id)}
                    className={cn(
                      "text-left rounded-xl border p-4 transition-colors hover:bg-muted/40",
                      active && "border-primary ring-2 ring-primary/20 bg-primary/5"
                    )}>
                    <div className="flex items-center gap-3">
                      <div className={cn("h-10 w-10 rounded-lg grid place-items-center",
                        active ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium">{opt.title}</div>
                        <div className="text-sm text-muted-foreground">{opt.desc}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {origen === "ia" ? (
              <>
                <div className="grid gap-2">
                  <Label>Equipo o producto</Label>
                  <Input placeholder="Ej: Generador eléctrico 25 kVA" value={equipo} onChange={(e) => setEquipo(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Instrucción / idea de la publicación</Label>
                  <Textarea rows={4} placeholder="Describe el mensaje, oferta o ángulo concreto…"
                    value={idea} onChange={(e) => setIdea(e.target.value)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="grid gap-2">
                    <Label>Ángulo</Label>
                    <Select value={angulo} onValueChange={setAngulo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ANGULOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Formato</Label>
                    <Select value={formato} onValueChange={setFormato}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{FORMATOS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
                    drag ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}>
                  <input ref={fileInputRef} type="file" hidden
                    accept="video/mp4,video/quicktime,video/x-msvideo,image/jpeg,image/png,image/webp"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                  {!uploadPreview && (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Upload className="h-8 w-8" />
                      <div className="font-medium text-foreground">Arrastra tu archivo o haz click</div>
                      <div className="text-sm">MP4, MOV, AVI hasta 500MB · JPG, PNG, WEBP hasta 50MB</div>
                    </div>
                  )}
                  {uploadPreview && uploadTipo === "imagen" && (
                    <img src={uploadPreview} alt="preview" className="mx-auto max-h-72 rounded-lg" />
                  )}
                  {uploadPreview && uploadTipo === "video" && (
                    <video src={uploadPreview} controls className="mx-auto max-h-72 rounded-lg" />
                  )}
                </div>
                {uploadFile && (
                  <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      {uploadTipo === "video" ? <VideoIcon className="h-4 w-4 text-primary" /> : <ImageIcon className="h-4 w-4 text-primary" />}
                      <span className="text-sm truncate">{uploadFile.name}</span>
                      {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {uploadedUrl && <CheckCircle2 className="h-4 w-4 text-success" />}
                    </div>
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); clearUpload(); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <div className="grid gap-2">
                  <Label>Equipo o producto que aparece</Label>
                  <Input placeholder="Ej: Generador eléctrico 25 kVA" value={equipo} onChange={(e) => setEquipo(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Ángulo del mensaje</Label>
                  <Select value={angulo} onValueChange={setAngulo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ANGULOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Contexto adicional</Label>
                  <Textarea rows={3} placeholder="Describe brevemente qué muestra el contenido…"
                    value={contextoExtra} onChange={(e) => setContextoExtra(e.target.value)} />
                </div>
              </>
            )}

            {/* Redes (común) */}
            <div className="grid gap-2">
              <Label>Redes</Label>
              <div className="flex flex-wrap gap-2">
                {REDES.map((r) => {
                  const active = redes.includes(r);
                  return (
                    <button key={r} type="button" onClick={() => toggleRed(r)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"
                      }`}>{r}</button>
                  );
                })}
              </div>
            </div>

            {/* Biblioteca contexto (común) */}
            <div className="grid gap-2">
              <Label>Adjuntar contexto (Biblioteca)</Label>
              {biblioteca.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no tienes archivos. Súbelos en la sección Biblioteca.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {biblioteca.map((a) => (
                    <label key={a.id} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                      <Checkbox checked={contexto.includes(a.id)} onCheckedChange={() => toggleCtx(a.id)} />
                      <div className="flex items-center gap-2 min-w-0">
                        {a.tipo === "pdf" ? <FileText className="h-4 w-4 text-primary shrink-0" /> : <ImageIcon className="h-4 w-4 text-primary shrink-0" />}
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
              {origen === "ia" ? (
                <Button disabled={!canStep1IA} onClick={() => setStep(2)}>
                  Refinar con el agente <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button disabled={!canStep1Upload || uploading} onClick={generarCopyPropio}>
                  Generar copy <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Refinar (solo IA) */}
      {step === 2 && origen === "ia" && (
        <Card>
          <CardHeader><CardTitle>Refinar con el agente</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[420px] overflow-y-auto p-1">
              {chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}>
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
              <Input placeholder="Escribe tu respuesta…" value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()} />
              <Button variant="outline" onClick={sendChat}><Send className="h-4 w-4" /></Button>
            </div>
            <div className="flex justify-between pt-6">
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-2" /> Atrás</Button>
              <Button onClick={generarIA}>Generar contenido <ArrowRight className="h-4 w-4 ml-2" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — Generación / Loading */}
      {step === 3 && (
        <Card>
          <CardContent className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h3 className="text-lg font-medium">
              {origen === "ia" ? "Generando con Higgsfield…" : "Generando copy para cada red…"}
            </h3>
            <p className="text-sm text-muted-foreground">Esto puede tomar unos segundos.</p>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 — Aprobar */}
      {step === 4 && (
        <Card>
          <CardHeader><CardTitle>Aprobar contenido</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl overflow-hidden border bg-muted aspect-video flex items-center justify-center">
              {origen === "ia" && imagenUrl && (
                <img src={imagenUrl} alt="Generado" className="w-full h-full object-cover" />
              )}
              {origen === "contenido_propio" && uploadedUrl && uploadTipo === "imagen" && (
                <img src={uploadedUrl} alt="Subido" className="w-full h-full object-contain" />
              )}
              {origen === "contenido_propio" && uploadedUrl && uploadTipo === "video" && (
                <video src={uploadedUrl} controls className="w-full h-full object-contain" />
              )}
            </div>
            <Tabs defaultValue={redes[0]}>
              <TabsList>{redes.map((r) => <TabsTrigger key={r} value={r}>{r}</TabsTrigger>)}</TabsList>
              {redes.map((r) => (
                <TabsContent key={r} value={r} className="pt-3">
                  <Textarea rows={6} value={copyByRed[r] || ""}
                    onChange={(e) => setCopyByRed((p) => ({ ...p, [r]: e.target.value }))} />
                </TabsContent>
              ))}
            </Tabs>
            <div className="flex justify-between">
              <Button variant="outline" onClick={origen === "ia" ? generarIA : generarCopyPropio} disabled={generating}>
                <RefreshCw className="h-4 w-4 mr-2" /> {origen === "ia" ? "Regenerar" : "Regenerar copy"}
              </Button>
              <Button onClick={aprobarYProgramar} className="bg-success hover:bg-success/90 text-success-foreground">
                Aprobar y programar <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 — Programar */}
      {step === 5 && (
        <Card>
          <CardHeader><CardTitle>Programar publicación</CardTitle></CardHeader>
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
              <Button variant="outline" size="sm" onClick={() => setQuickDate(new Date(), "09:00")}>Hoy 9am</Button>
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); setQuickDate(d, "09:00"); }}>Mañana 9am</Button>
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 5); setQuickDate(d, "09:00"); }}>Esta semana</Button>
            </div>
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="text-sm text-muted-foreground mb-2">Resumen</div>
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge variant="outline">{origen === "ia" ? "Generado con IA" : "Contenido propio"}</Badge>
                {redes.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
              </div>
              <div className="text-sm">{fechaResumen}</div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(4)}><ArrowLeft className="h-4 w-4 mr-2" /> Atrás</Button>
              <Button onClick={guardarYEnviar} disabled={!fecha}>Enviar a Zernio → publicar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
