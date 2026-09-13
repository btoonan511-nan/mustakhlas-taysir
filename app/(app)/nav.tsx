"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import type { SessionUser } from "@/lib/auth";

const links = [
  { href: "/", label: "التحليل", exact: true },
  { href: "/certificates/new", label: "مستخلص جديد" },
  { href: "/accounts", label: "الحسابات" },
  { href: "/certificates", label: "المستخلصات" },
  { href: "/reconciliation", label: "المطابقة", admin: true },
  { href: "/settings", label: "الإعدادات", admin: true },
];

export function Nav({ user }: { user: SessionUser }) {
  const path = usePathname();
  return (
    <header className="no-print bg-white border-b border-stone-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="font-bold text-emerald-800 whitespace-nowrap">تيسر · المستخلصات</Link>
        <nav className="flex items-center gap-1 overflow-x-auto flex-1">
          {links.filter((l) => !l.admin || user.role === "admin").map((l) => {
            const active = l.exact ? path === l.href : path.startsWith(l.href) && !(l.href === "/certificates" && path.startsWith("/certificates/new"));
            return (
              <Link key={l.href} href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${active ? "bg-emerald-50 text-emerald-800 font-semibold" : "text-stone-600 hover:bg-stone-100"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm text-stone-600">
          <span className="hidden sm:inline">{user.displayName}</span>
          <form action={logoutAction}><button className="btn-secondary btn-sm">خروج</button></form>
        </div>
      </div>
    </header>
  );
}
