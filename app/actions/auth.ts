"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await login(username, password);
  if (!user) return { error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
