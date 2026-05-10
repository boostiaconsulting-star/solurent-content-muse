import { Link, useRouterState } from "@tanstack/react-router";
import { Calendar, FolderOpen, BarChart3, Sparkles } from "lucide-react";

const items = [
  { title: "Publicaciones", url: "/", icon: Sparkles },
  { title: "Calendario", url: "/calendario", icon: Calendar },
  { title: "Biblioteca", url: "/biblioteca", icon: FolderOpen },
  { title: "Métricas", url: "/metricas", icon: BarChart3 },
];

export function Sidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-6 py-6 border-b">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">
            S
          </div>
          <div>
            <div className="font-semibold leading-tight">Solurent</div>
            <div className="text-xs text-muted-foreground">AI Content Center</div>
          </div>
        </div>
      </div>
      <nav className="p-3 space-y-1">
        {items.map((item) => {
          const active = path === item.url || (item.url !== "/" && path.startsWith(item.url));
          return (
            <Link
              key={item.url}
              to={item.url}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-muted text-sidebar-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-4 text-xs text-muted-foreground">
        <p>v1.0 · Hecho para Raúl</p>
      </div>
    </aside>
  );
}
