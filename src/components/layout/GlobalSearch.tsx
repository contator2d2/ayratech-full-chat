import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperadmin } from "@/hooks/use-superadmin";
import { getNavSections } from "./Sidebar";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { user, modulesEnabled, pagePermissions } = useAuth();
  const { isSuperadmin } = useSuperadmin();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const sections = useMemo(() => {
    const hasConnections = user?.has_connections !== false;
    const isAdminRole = (role?: string) => ["owner", "admin", "manager"].includes(role || "");
    const isOwnerRole = (role?: string) => role === "owner";
    const userIsAdmin = isSuperadmin || isAdminRole(user?.role);
    const userIsOwner = isSuperadmin || isOwnerRole(user?.role);
    const hasTemplate = !!pagePermissions;

    return getNavSections(hasConnections)
      .filter((section) => {
        if (section.moduleKey && !modulesEnabled[section.moduleKey] && !isSuperadmin) return false;
        if (!hasTemplate && section.adminOnly && !userIsAdmin) return false;
        return true;
      })
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.moduleKey && !modulesEnabled[item.moduleKey] && !isSuperadmin) return false;
          if (item.superadminOnly && !isSuperadmin) return false;
          if (hasTemplate && item.pageKey && item.pageKey in (pagePermissions || {})) {
            return pagePermissions![item.pageKey] === true;
          }
          if (item.adminOnly && !userIsAdmin) return false;
          if (item.ownerOnly && !userIsOwner) return false;
          return true;
        }),
      }))
      .filter((s) => s.items.length > 0);
  }, [user, modulesEnabled, pagePermissions, isSuperadmin]);

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 h-9 px-3 rounded-lg border border-border/60 bg-muted/40",
          "text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          "min-w-[220px] max-w-[320px]"
        )}
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left truncate">Buscar menus...</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar menus, páginas e módulos..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado.</CommandEmpty>
          <CommandGroup heading="Geral">
            <CommandItem value="Dashboard" onSelect={() => go("/dashboard")}>
              <span>Dashboard</span>
            </CommandItem>
          </CommandGroup>
          {sections.map((section) => (
            <CommandGroup key={section.title} heading={section.title}>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`${section.title}-${item.href}-${item.name}`}
                    value={`${item.name} ${section.title}`}
                    onSelect={() => go(item.href)}
                  >
                    <Icon className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{item.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{section.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
