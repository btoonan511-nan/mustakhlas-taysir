import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const COOKIE = "taysir_session";
const secret = () => {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(process.env.SESSION_SECRET);
};

export type SessionUser = { id: number; username: string; displayName: string; role: "admin" | "user" };

export async function login(username: string, password: string): Promise<SessionUser | null> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.username, username.trim().toLowerCase())).limit(1);
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return null;
  const user: SessionUser = { id: u.id, username: u.username, displayName: u.displayName, role: u.role };
  const token = await new SignJWT(user).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return user;
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: Number(payload.id), username: String(payload.username), displayName: String(payload.displayName), role: payload.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/");
  return u;
}
