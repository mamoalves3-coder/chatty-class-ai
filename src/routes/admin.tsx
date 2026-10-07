import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ADMIN_KEY, PageShell, SiteHeader } from "@/components/SiteHeader";
import { adminDeleteLesson, adminOverview, adminSaveLesson, adminSetStatus } from "@/lib/school.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel do Administrador — Aprender Infantil" },
      { name: "description", content: "Gestão de alunos, aulas e entradas diárias." },
      { property: "og:title", content: "Painel do Administrador — Aprender Infantil" },
      { property: "og:description", content: "Gestão de alunos, aulas e entradas diárias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const STATUS: Record<string, string> = { pending: "Aguardando", approved: "Aprovado", blocked: "Bloqueado" };

function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const t = localStorage.getItem(ADMIN_KEY);
    if (!t) navigate({ to: "/" });
    else setToken(t);
  }, [navigate]);

  const logout = () => { localStorage.removeItem(ADMIN_KEY); navigate({ to: "/", replace: true }); };

  return (
    <PageShell>
      <SiteHeader right={<button className="btn-ghost text-sm" onClick={logout}>Sair</button>} />
      {token && <AdminBody token={token} onAuthError={logout} />}
    </PageShell>
  );
}

type LessonForm = { id?: string; position: string; videoUrl: string; theme: string; description: string };

function AdminBody({ token, onAuthError }: { token: string; onAuthError: () => void }) {
  const overview = useServerFn(adminOverview);
  const setStatus = useServerFn(adminSetStatus);
  const saveLesson = useServerFn(adminSaveLesson);
  const delLesson = useServerFn(adminDeleteLesson);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin"], queryFn: () => overview({ data: { adminToken: token } }), refetchInterval: 5000, retry: false });
  const [form, setForm] = useState<LessonForm>({ position: "", videoUrl: "", theme: "", description: "" });
  const [err, setErr] = useState<string | null>(null);
  const [day, setDay] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Maputo" }));

  useEffect(() => { if (q.error) onAuthError(); }, [q.error, onAuthError]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });
  const d = q.data;
  if (!d) return <p className="px-8 text-muted-foreground">A carregar…</p>;

  const byId = new Map(d.students.map((s) => [s.id, s]));
  const dayVisits = d.visits.filter((v) => v.visited_on === day);
  const nextPos = (d.lessons.at(-1)?.position ?? 0) + 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await saveLesson({ data: { adminToken: token, id: form.id, position: Number(form.position || nextPos), videoUrl: form.videoUrl, theme: form.theme, description: form.description } });
      setForm({ position: "", videoUrl: "", theme: "", description: "" });
      refresh();
    } catch {
      setErr("Verifica o link do vídeo e o tema.");
    }
  }

  return (
    <div className="mx-auto grid max-w-[1440px] gap-8 px-6 pb-16 md:px-8 lg:grid-cols-2">
      <section className="glass rounded-[2rem] p-7 shadow-deep">
        <p className="text-[11px] uppercase tracking-[0.35em] text-primary/70">alunos</p>
        <h2 className="mt-1 text-3xl font-black">Cadastros</h2>
        <div className="mt-5 space-y-3">
          {d.students.length === 0 && <p className="text-muted-foreground">Ainda não há alunos.</p>}
          {d.students.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-glass px-4 py-3">
              <div>
                <p className="font-bold">{s.first_name} {s.last_name} <span className="font-normal text-muted-foreground">· {s.age} anos</span></p>
                <p className="text-xs text-muted-foreground">{STATUS[s.status] ?? s.status} · {s.completed} aulas concluídas</p>
              </div>
              <div className="flex gap-2">
                {s.status !== "approved" && (
                  <button className="rounded-full bg-success px-4 py-1.5 text-sm font-bold text-ink" onClick={async () => { await setStatus({ data: { adminToken: token, studentId: s.id, status: "approved" } }); refresh(); }}>Aprovar</button>
                )}
                {s.status !== "blocked" && (
                  <button className="rounded-full border border-destructive px-4 py-1.5 text-sm text-destructive" onClick={async () => { await setStatus({ data: { adminToken: token, studentId: s.id, status: "blocked" } }); refresh(); }}>Bloquear</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass rounded-[2rem] p-7 shadow-deep">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-primary/70">registo diário</p>
            <h2 className="mt-1 text-3xl font-black">Entradas do dia</h2>
          </div>
          <input type="date" className="field max-w-[11rem]" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="mt-5 space-y-2">
          {dayVisits.length === 0 && <p className="text-muted-foreground">Ninguém entrou neste dia.</p>}
          {dayVisits.map((v) => {
            const s = byId.get(v.student_id);
            const t = (x: string) => new Date(x).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Maputo" });
            return (
              <div key={v.student_id + v.visited_on} className="flex justify-between rounded-full border border-border bg-glass px-5 py-2.5">
                <span className="font-bold">{s ? `${s.first_name} ${s.last_name}` : "—"}</span>
                <span className="text-sm text-muted-foreground">{t(v.first_at)} – {t(v.last_at)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-[2rem] p-7 shadow-deep lg:col-span-2">
        <p className="text-[11px] uppercase tracking-[0.35em] text-primary/70">conteúdo · tema e descrição são só para a IA</p>
        <h2 className="mt-1 text-3xl font-black">Aulas</h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <label className="text-sm text-muted-foreground">Nº
                <input type="number" min={1} className="field mt-1" placeholder={String(nextPos)} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </label>
              <label className="text-sm text-muted-foreground">Link do vídeo
                <input required type="url" className="field mt-1" placeholder="https://youtube.com/…" value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} />
              </label>
            </div>
            <label className="block text-sm text-muted-foreground">Tema (oculto ao aluno)
              <input required className="field mt-1" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
            </label>
            <label className="block text-sm text-muted-foreground">Descrição (oculta ao aluno)
              <textarea rows={4} className="field mt-1" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex gap-3">
              <button className="btn-primary">{form.id ? "Guardar alterações" : "Adicionar aula"}</button>
              {form.id && <button type="button" className="btn-ghost" onClick={() => setForm({ position: "", videoUrl: "", theme: "", description: "" })}>Cancelar</button>}
            </div>
          </form>
          <div className="space-y-3">
            {d.lessons.length === 0 && <p className="text-muted-foreground">Ainda não há aulas.</p>}
            {d.lessons.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-glass p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">Aula {l.position} · {l.theme}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.video_url}</p>
                    {l.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{l.description}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setForm({ id: l.id, position: String(l.position), videoUrl: l.video_url, theme: l.theme, description: l.description })}>Editar</button>
                    <button className="rounded-full border border-destructive px-3 py-1.5 text-sm text-destructive" onClick={async () => { if (confirm("Apagar esta aula?")) { await delLesson({ data: { adminToken: token, id: l.id } }); refresh(); } }}>Apagar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
