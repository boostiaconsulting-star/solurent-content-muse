import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Palette, RefreshCw, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/content-center";
import { analyzeBranding } from "@/lib/branding.functions";

export const Route = createFileRoute("/branding")({
  head: () => ({
    meta: [
      { title: "Branding · Solurent" },
      { name: "description", content: "Identidad de marca aplicada a las publicaciones." },
    ],
  }),
  component: BrandingPage,
});

type BrandRow = {
  website_url: string | null;
  logo_url: string | null;
  colors: Record<string, string> | null;
  fonts: Record<string, string> | null;
  updated_at: string | null;
};

function BrandingPage() {
  const analyze = useServerFn(analyzeBranding);
  const [website, setWebsite] = useState("https://www.solurent.mx");
  const [brand, setBrand] = useState<BrandRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  const reload = async () => {
    setLoading(true);
    const { data } = await supabase.from("branding").select("*").eq("id", "default").maybeSingle();
    if (data) {
      setBrand(data as BrandRow);
      if (data.website_url) setWebsite(data.website_url);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const run = async () => {
    if (!website) return;
    setAnalyzing(true);
    try {
      await analyze({ data: { website_url: website } });
      toast.success("Branding actualizado");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const colors = brand?.colors ?? {};
  const colorEntries = Object.entries(colors).filter(([, v]) => !!v);

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold flex items-center gap-2">
          <Palette className="h-7 w-7 text-primary" /> Branding
        </h1>
        <p className="text-muted-foreground">
          La IA analiza tu sitio web y aplica el logo y los colores a las publicaciones generadas.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analizar sitio web</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>URL del sitio</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://www.solurent.mx"
                />
              </div>
              <Button onClick={run} disabled={analyzing || !website}>
                {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {brand?.logo_url ? "Re-analizar" : "Analizar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : !brand?.logo_url && colorEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aún no hay branding. Pulsa "Analizar" para extraer el logo y la paleta.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
            <CardContent>
              {brand?.logo_url ? (
                <div className="bg-muted rounded-lg p-6 flex items-center justify-center min-h-[180px]">
                  <img src={brand.logo_url} alt="Logo" className="max-h-32 max-w-full object-contain" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No se detectó logo.</p>
              )}
              {brand?.logo_url && (
                <p className="text-xs text-muted-foreground mt-2 break-all">{brand.logo_url}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Paleta</CardTitle></CardHeader>
            <CardContent>
              {colorEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin colores detectados.</p>
              ) : (
                <div className="space-y-2">
                  {colorEntries.map(([name, hex]) => (
                    <div key={name} className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-md border shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium capitalize">{name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{hex}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {brand?.fonts && (brand.fonts.heading || brand.fonts.body) && (
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-base">Tipografía</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
                {brand.fonts.heading && <div><span className="text-muted-foreground">Títulos:</span> <span className="font-medium">{brand.fonts.heading}</span></div>}
                {brand.fonts.body && <div><span className="text-muted-foreground">Cuerpo:</span> <span className="font-medium">{brand.fonts.body}</span></div>}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {brand?.updated_at && (
        <p className="text-xs text-muted-foreground">
          Última actualización: {new Date(brand.updated_at).toLocaleString("es-MX")}
        </p>
      )}
    </div>
  );
}
