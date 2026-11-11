import { CalendarDays, HeartPulse, ListChecks, ListTodo, Sun, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/lifestyle", label: "Lifestyle", icon: HeartPulse },
  { href: "/lists", label: "Lists", icon: ListChecks },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
