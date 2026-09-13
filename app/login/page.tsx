import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/");
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-emerald-800">شركة تيسر</div>
          <div className="text-sm text-stone-500 mt-1">نظام مستخلصات المقاولين</div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
