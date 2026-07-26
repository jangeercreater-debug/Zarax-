"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bot, MessageSquare, Library, Phone, Workflow, Key, Users, Settings, BarChart2, Shield, Activity, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/telephony", label: "Telephony", icon: Phone },
  { href: "/knowledge-base", label: "Knowledge Base", icon: Library },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/audit-logs", label: "Audit Logs", icon: Shield },
  { href: "/system-health", label: "System Health", icon: Activity },
  { href: "/performance", label: "Performance", icon: Gauge },
];
const BOTTOM_ITEMS = [
  { href: "/api-keys", label: "API Keys", icon: Key },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  const NavLink = ({ item }: { item: { href: string; label: string; icon: React.ElementType } }) => {
    const Icon = item.icon;
    return (
      <Link href={item.href} onClick={onNavigate} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", isActive(item.href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  };
  return (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold">Z</div>
        <span className="text-lg font-semibold tracking-tight">Zarax</span>
      </div>
      <div className="flex flex-col gap-1">{NAV_ITEMS.map((item) => <NavLink key={item.href} item={item} />)}</div>
      <div className="mt-auto flex flex-col gap-1 border-t pt-4">{BOTTOM_ITEMS.map((item) => <NavLink key={item.href} item={item} />)}</div>
    </nav>
  );
}
