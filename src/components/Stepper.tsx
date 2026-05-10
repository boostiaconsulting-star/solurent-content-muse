import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Idea", "Refinar", "Generar", "Aprobar", "Programar"];

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center w-full overflow-x-auto gap-2 mb-8">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <li key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={cn(
                "h-8 w-8 rounded-full grid place-items-center text-sm font-medium border transition-colors",
                done && "bg-success text-success-foreground border-success",
                active && "bg-primary text-primary-foreground border-primary",
                !done && !active && "bg-card text-muted-foreground border-border",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : idx}
            </div>
            <span
              className={cn(
                "text-sm",
                active ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {idx < STEPS.length && (
              <div className="hidden sm:block w-8 h-px bg-border mx-1" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
