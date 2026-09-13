import { requireUser } from "@/lib/auth";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex-1 flex flex-col">
      <Nav user={user} />
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
