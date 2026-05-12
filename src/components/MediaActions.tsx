import { Download, MessageCircle, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  url: string;
  filename?: string;
  caption?: string;
  className?: string;
};

export function MediaActions({ url, filename, caption, className }: Props) {
  const download = async () => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = filename || url.split("/").pop() || "imagen.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
    } catch {
      window.open(url, "_blank");
    }
  };

  const whatsapp = () => {
    const text = `${caption ? caption + "\n\n" : ""}${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className={`flex gap-1.5 ${className ?? ""}`}>
      <Button size="icon" variant="secondary" className="h-8 w-8 shadow-sm" onClick={download} title="Descargar">
        <Download className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="secondary" className="h-8 w-8 shadow-sm" onClick={whatsapp} title="Compartir por WhatsApp">
        <MessageCircle className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="secondary" className="h-8 w-8 shadow-sm" onClick={copyLink} title="Copiar enlace">
        <LinkIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}
