import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().uuid() });

export const registerStudent = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        firstName: z.string().trim().min(1).max(60),
        lastName: z.string().trim().min(1).max(60),
        age: z.number().int().min(2).max(18),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db } = await import("./school.server");
    const { data: row, error } = await db()
      .from("students")
      .insert({ first_name: data.firstName, last_name: data.lastName, age: data.age })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    return { token: row.token as string };
  });

export const getStudentState = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { db, studentByToken, todayKey, LESSONS_PER_DAY } = await import("./school.server");
    const s = await studentByToken(data.token);
    if (!s) return { student: null };
    const student = { firstName: s.first_name, lastName: s.last_name, age: s.age, status: s.status as string };
    if (s.status !== "approved") return { student };

    const today = todayKey();
    await db()
      .from("visits")
      .upsert({ student_id: s.id, visited_on: today, last_at: new Date().toISOString() }, { onConflict: "student_id,visited_on", ignoreDuplicates: false });

    const [{ data: lessons }, { data: progress }] = await Promise.all([
      db().from("lessons").select("id, position, video_url").order("position").order("created_at"),
      db().from("progress").select("lesson_id, position_seconds, completed_at").eq("student_id", s.id),
    ]);
    const prog = progress ?? [];
    const completedToday = prog.filter((p) => p.completed_at && todayKey(new Date(p.completed_at)) === today).length;
    return {
      student,
      lessons: (lessons ?? []).map((l) => {
        const p = prog.find((x) => x.lesson_id === l.id);
        return {
          id: l.id,
          position: l.position,
          videoUrl: l.video_url,
          completed: !!p?.completed_at,
          seconds: p?.position_seconds ?? 0,
        };
      }),
      completedToday,
      perDay: LESSONS_PER_DAY,
    };
  });

async function approvedStudent(token: string) {
  const { studentByToken } = await import("./school.server");
  const s = await studentByToken(token);
  if (!s || s.status !== "approved") throw new Error("Aluno não aprovado");
  return s;
}

export const saveProgress = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.extend({ lessonId: z.string().uuid(), seconds: z.number().int().min(0) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("./school.server");
    const s = await approvedStudent(data.token);
    await db()
      .from("progress")
      .upsert(
        { student_id: s.id, lesson_id: data.lessonId, position_seconds: data.seconds, updated_at: new Date().toISOString() },
        { onConflict: "student_id,lesson_id" },
      );
    return { ok: true };
  });

export const completeLesson = createServerFn({ method: "POST" })
  .inputValidator((d) => tokenSchema.extend({ lessonId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db, todayKey, LESSONS_PER_DAY } = await import("./school.server");
    const s = await approvedStudent(data.token);
    const { data: prog } = await db().from("progress").select("lesson_id, completed_at").eq("student_id", s.id);
    const existing = prog?.find((p) => p.lesson_id === data.lessonId);
    if (existing?.completed_at) return { ok: true };
    const today = todayKey();
    const doneToday = (prog ?? []).filter((p) => p.completed_at && todayKey(new Date(p.completed_at)) === today).length;
    if (doneToday >= LESSONS_PER_DAY) throw new Error("Já concluíste as aulas de hoje. Volta amanhã!");
    await db()
      .from("progress")
      .upsert(
        { student_id: s.id, lesson_id: data.lessonId, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "student_id,lesson_id" },
      );
    return { ok: true };
  });

export const tutorTurn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    tokenSchema
      .extend({
        lessonId: z.string().uuid(),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(60),
        drawing: z.string().startsWith("data:image/").max(3_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db, todayKey, LESSONS_PER_DAY } = await import("./school.server");
    const { runTutor } = await import("./tutor.server");
    const s = await approvedStudent(data.token);
    const { data: lesson } = await db().from("lessons").select("position, theme, description").eq("id", data.lessonId).single();
    if (!lesson) throw new Error("Aula não encontrada");
    try {
      const text = await runTutor({ student: s, lesson, history: data.history, drawing: data.drawing });
      const { data: prog } = await db().from("progress").select("completed_at").eq("student_id", s.id);
      const today = todayKey();
      const dayDone = (prog ?? []).filter((p) => p.completed_at && todayKey(new Date(p.completed_at)) === today).length >= LESSONS_PER_DAY;
      return { text, dayDone };
    } catch (e) {
      console.error("tutor error", e);
      return { text: "", dayDone: false, error: "A tutora não conseguiu responder agora. Tenta novamente daqui a pouco." };
    }
  });

// ---------------- Admin ----------------

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string(), password: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { ADMIN_EMAIL, ADMIN_PASSWORD, signAdmin } = await import("./school.server");
    if (data.email.trim().toLowerCase() !== ADMIN_EMAIL || data.password !== ADMIN_PASSWORD) {
      return { token: null, error: "E-mail ou senha incorretos" };
    }
    return { token: signAdmin(), error: null };
  });

const adminSchema = z.object({ adminToken: z.string() });

export const adminOverview = createServerFn({ method: "POST" })
  .inputValidator((d) => adminSchema.parse(d))
  .handler(async ({ data }) => {
    const { db, assertAdmin } = await import("./school.server");
    assertAdmin(data.adminToken);
    const [{ data: students }, { data: lessons }, { data: visits }, { data: progress }] = await Promise.all([
      db().from("students").select("id, first_name, last_name, age, status, created_at").order("created_at", { ascending: false }),
      db().from("lessons").select("*").order("position").order("created_at"),
      db().from("visits").select("student_id, visited_on, first_at, last_at").order("visited_on", { ascending: false }).order("first_at", { ascending: false }).limit(500),
      db().from("progress").select("student_id, completed_at").not("completed_at", "is", null),
    ]);
    return {
      students: (students ?? []).map((s) => ({
        ...s,
        completed: (progress ?? []).filter((p) => p.student_id === s.id).length,
      })),
      lessons: lessons ?? [],
      visits: visits ?? [],
    };
  });

export const adminSetStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => adminSchema.extend({ studentId: z.string().uuid(), status: z.enum(["approved", "blocked", "pending"]) }).parse(d))
  .handler(async ({ data }) => {
    const { db, assertAdmin } = await import("./school.server");
    assertAdmin(data.adminToken);
    const { error } = await db().from("students").update({ status: data.status }).eq("id", data.studentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSaveLesson = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    adminSchema
      .extend({
        id: z.string().uuid().optional(),
        position: z.number().int().min(1).max(1000),
        videoUrl: z.string().trim().url(),
        theme: z.string().trim().min(1).max(300),
        description: z.string().trim().max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db, assertAdmin } = await import("./school.server");
    assertAdmin(data.adminToken);
    const row = { position: data.position, video_url: data.videoUrl, theme: data.theme, description: data.description };
    const q = data.id ? db().from("lessons").update(row).eq("id", data.id) : db().from("lessons").insert(row);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteLesson = createServerFn({ method: "POST" })
  .inputValidator((d) => adminSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { db, assertAdmin } = await import("./school.server");
    assertAdmin(data.adminToken);
    const { error } = await db().from("lessons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
