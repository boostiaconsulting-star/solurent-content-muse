import { useState } from "react";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
// Tables are pending in generated types; cast to any for now.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = typedSupabase;

export type Publicacion = {
  id: string;
  equipo: string | null;
  idea: string | null;
  angulo: string | null;
  formato: string | null;
  redes: string[] | null;
  copy: Record<string, string> | null;
  imagen_url: string | null;
  fecha_programada: string | null;
  estado: string;
  created_at: string;
};

export type Archivo = {
  id: string;
  nombre: string;
  tipo: string;
  categoria: string | null;
  url: string;
  created_at: string;
};

export const ANGULOS = [
  "Seguridad",
  "Confort",
  "Garantía",
  "Precio/Oferta",
  "Educativo",
  "Testimonio",
] as const;

export const FORMATOS = ["Imagen", "Video", "Carrusel"] as const;
export const REDES = ["Facebook", "Instagram", "TikTok", "YouTube Shorts"] as const;
export const CATEGORIAS = [
  "Ficha técnica",
  "Catálogo",
  "Foto de equipo",
  "Promoción proveedor",
] as const;

export function useToggleState<T>(initial: T[] = []) {
  const [items, setItems] = useState<T[]>(initial);
  const toggle = (v: T) =>
    setItems((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  return { items, setItems, toggle };
}

export { supabase };
