import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ADMIN_EMAIL = "mamoalves3@gmail.com";
export const ADMIN_PASSWORD = "alvino2018";
export const LESSONS_PER_DAY = 2;
const TZ = "Africa/Maputo";

export function db() {
  return supabaseAdmin;
}

export function todayKey(d: Date = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function secret() {
  return (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "fallback") + ":admin";
}

export function signAdmin() {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const sig = createHmac("sha256", secret()).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function assertAdmin(token: string | undefined) {
  if (!token) throw new Error("Não autorizado");
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) throw new Error("Sessão expirada");
  const expected = createHmac("sha256", secret()).update(exp).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Não autorizado");
}

export async function studentByToken(token: string) {
  const { data, error } = await db().from("students").select("*").eq("token", token).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
