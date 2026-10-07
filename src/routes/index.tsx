import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageShell, SiteHeader } from "@/components/SiteHeader";
import { VoiceTutor } from "@/components/VoiceTutor";
import { completeLesson, getStudentState, registerStudent, saveProgress } from "@/lib/school.functions";
import { videoEmbed } from "@/lib/video";
import img1 from "@/assets/lesson-1.jpg";
import img2 from "@/assets/lesson-2.jpg";
import img3 from "@/assets/lesson-3.jpg";

const THUMBS = [img1, img2, img3];
const KEY = "ai_student_token";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aprender Infantil — Escola digital com tutora por voz" },
      { name: "description", content: "Aulas em vídeo e uma tutora de IA que conversa por voz com cada criança." },
      { property: "og:title", content: "Aprender Infantil — Escola digital com tutora por voz" },
      { property: "og:description", content: "Aulas em vídeo e uma tutora de IA que conversa por voz com cada criança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudentHome,
});

function StudentHome() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setToken(localStorage.getItem(KEY));
    setReady(true);
  }, []);

  return (
    <PageShell>
      <SiteHeader />
      {!ready ? null : !token ? (
        <SignUp onDone={(t) => { localStorage.setItem(KEY, t); setToken(t); }} />
      ) : (
        <StudentArea token={token} onReset={() => { localStorage.removeItem(KEY); setToken(null); }} />
      )}
    </PageShell>
  );
}

function SignUp({ onDone }: { onDone: (t: string) => void }) {
  const reg = useServerFn(registerStudent);
  const [f, setF] = useState({ firstName: "", lastName: "", age: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-10 md:px-8 lg:grid-cols-[1.15fr_1fr]">
      <form
        className="glass rounded-[2rem] p-9 shadow-deep"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await reg({ data: { firstName: f.firstName, lastName: f.lastName, age: Number(f.age) } });
            onDone(r.token);
          } catch {
            setErr("Verifica os dados e tenta de novo.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.35em] text-primary/80">antes de começar</p>
        <h1 className="mt-3 text-[clamp(2.4rem,5vw,4.2rem)] font-black leading-[0.95] tracking-tight">
          Olá! Como te <span className="text-gradient">chamas?</span>
        </h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-muted-foreground">Nome
            <input required className="field mt-1" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
          </label>
          <label className="text-sm text-muted-foreground">Apelido
            <input required className="field mt-1" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
          </label>
          <label className="text-sm text-muted-foreground">Idade
            <input required type="number" min={2} max={18} className="field mt-1" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} />
          </label>
        </div>
        {err && <p className="mt-4 text-sm text-destructive">{err}</p>}
        <button disabled={busy} className="btn-primary mt-8">{busy ? "A enviar…" : "Entrar na escola"}</button>
      </form>
      <img src={img3} alt="Tutora a cumprimentar crianças" width={1088} height={608} className="anim-float rotate-[4deg] rounded-[1.8rem] border border-border shadow-deep" />
    </section>
  );
}

function StudentArea({ token, onReset }: { token: string; onReset: () => void }) {
  const get = useServerFn(getStudentState);
  const q = useQuery({ queryKey: ["student", token], queryFn: () => get({ data: { token } }), refetchInterval: 5000 });
  const [active, setActive] = useState<string | null>(null);
  const [tutor, setTutor] = useState<{ id: string; n: number } | null>(null);

  if (q.isLoading) return <p className="px-8 text-muted-foreground">A carregar…</p>;
  const d = q.data;
  if (!d?.student) {
    return (
      <div className="mx-auto max-w-xl px-6 py-10 text-center">
        <p>Não encontrámos o teu registo.</p>
        <button className="btn-primary mt-4" onClick={onReset}>Registar de novo</button>
      </div>
    );
  }
  const s = d.student;
  const name = `${s.firstName} ${s.lastName}`;
  if (s.status !== "approved") {
    return (
      <section className="mx-auto max-w-2xl px-6 py-16">
        <div className="glass rounded-[2rem] p-10 text-center shadow-deep">
          <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-logo">
            <span className="anim-ring absolute inset-0 rounded-full border border-primary" />
            <span className="font-display text-xl font-black text-ink">⏳</span>
          </div>
          <h1 className="mt-6 text-4xl font-black">Olá, {name}!</h1>
          <p className="mt-3 text-muted-foreground">
            {s.status === "blocked" ? "O teu acesso está bloqueado. Fala com o administrador." : "Aguardando aprovação do administrador. Esta página atualiza sozinha."}
          </p>
        </div>
      </section>
    );
  }

  const lessons = d.lessons ?? [];
  const done = lessons.filter((l) => l.completed).length;
  const remainingToday = Math.max(0, (d.perDay ?? 2) - (d.completedToday ?? 0));
  const next = lessons.find((l) => !l.completed);
  const current = lessons.find((l) => l.id === active) ?? null;

  return (
    <>
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-6 py-10 md:px-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="glass rounded-[2rem] p-9 shadow-deep">
          <p className="text-[11px] uppercase tracking-[0.35em] text-primary/80">bem-vindo de volta</p>
          <h1 className="mt-3 text-[clamp(2.4rem,5vw,4.2rem)] font-black leading-[0.95] tracking-tight">
            Olá, {s.firstName}<br /><span className="text-gradient">{s.lastName}</span>.
          </h1>
          <p className="mt-4 max-w-md text-muted-foreground">
            {next ? "Vamos continuar a trilha exatamente de onde paraste — sem repetir aulas." : lessons.length ? "Concluíste todas as aulas. Parabéns!" : "Ainda não há aulas. Volta em breve!"}
          </p>
          {next && (
            <button className="btn-primary mt-7" disabled={remainingToday === 0} onClick={() => setActive(next.id)}>
              {remainingToday === 0 ? "Aulas de hoje concluídas — volta amanhã" : `Retomar Aula ${next.position}`}
            </button>
          )}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <Stat value={`${done}/${lessons.length}`} label="aulas concluídas" tone="text-primary" />
            <Stat value={`${remainingToday}`} label="restam hoje" tone="text-secondary" />
            <Stat value={`${s.age}`} label="anos" tone="text-success" />
          </div>
        </div>
        <div className="relative hidden h-[440px] lg:block">
          <div className="anim-float glass absolute right-0 top-2 w-[78%] rotate-[7deg] rounded-[1.8rem] p-6 shadow-deep">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-success to-accent font-display font-bold text-ink">I</div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">tutora de voz · Tia Iris</p>
            </div>
            <p className="mt-4 font-display text-2xl font-bold leading-snug">"Quando acabares a aula, vamos conversar, {s.firstName}!"</p>
            <div className="mt-5 flex h-12 items-center gap-1 rounded-xl border border-border bg-ink/30 px-4">
              {[4, 8, 3, 9, 5, 7, 3, 6].map((h, i) => (
                <span key={i} className="anim-wave w-1.5 rounded-full bg-primary" style={{ height: `${h * 4}px`, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
          <div className="anim-float2 glass absolute bottom-4 left-2 w-[62%] -rotate-[9deg] rounded-[1.6rem] p-5 shadow-deep">
            <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-full bg-gradient-logo">
              <span className="anim-ring absolute inset-0 rounded-full border border-primary" />
              <span className="anim-ring2 absolute inset-0 rounded-full border border-primary" />
              <span>🎙</span>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">Vais responder em voz alta</p>
          </div>
        </div>
      </section>

      {current && (
        <LessonPlayer
          key={current.id}
          token={token}
          lesson={current}
          canComplete={remainingToday > 0 || current.completed}
          onClose={() => setActive(null)}
          onCompleted={() => { setActive(null); setTutor({ id: current.id, n: current.position }); }}
        />
      )}

      <section className="mx-auto max-w-[1440px] px-6 pb-16 md:px-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-primary/70">hoje · {d.perDay} aulas</p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">Trilha de {s.firstName}</h2>
          </div>
          <p className="text-sm text-muted-foreground">progresso salvo automaticamente</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {lessons.map((l, i) => {
            const isNext = next?.id === l.id;
            const locked = !l.completed && (!isNext || remainingToday === 0);
            return (
              <button
                key={l.id}
                disabled={locked}
                onClick={() => setActive(l.id)}
                className={`overflow-hidden rounded-[1.6rem] border text-left backdrop-blur-md transition ${isNext ? "border-primary/40 bg-primary/10 shadow-glow" : "glass"} ${locked ? "opacity-60" : "hover:-translate-y-1"}`}
              >
                <div className="relative">
                  <img src={THUMBS[i % 3]} alt="" loading="lazy" width={1088} height={608} className="aspect-video w-full object-cover" />
                  <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${l.completed ? "bg-success text-ink" : isNext ? "bg-primary text-ink" : "bg-glass text-muted-foreground"}`}>
                    {l.completed ? "Concluída" : isNext ? (remainingToday ? (l.seconds ? "Em andamento" : "A seguir") : "Amanhã") : "Bloqueada"}
                  </span>
                </div>
                <div className="p-5">
                  <p className="font-display text-lg font-bold">Aula {l.position}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {l.completed ? "Toca para rever ou conversar com a tutora." : isNext ? "A tutora começa a conversa por voz ao concluir." : "Desbloqueia ao concluir a anterior."}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {tutor && (
        <VoiceTutor token={token} lessonId={tutor.id} lessonNumber={tutor.n} studentName={name} onClose={() => setTutor(null)} />
      )}
    </>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-glass p-4">
      <p className={`font-display text-3xl font-black ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function LessonPlayer({
  token, lesson, canComplete, onClose, onCompleted,
}: {
  token: string;
  lesson: { id: string; position: number; videoUrl: string; completed: boolean; seconds: number };
  canComplete: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const save = useServerFn(saveProgress);
  const complete = useServerFn(completeLesson);
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastSaved = useRef(0);
  const v = videoEmbed(lesson.videoUrl);

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      await complete({ data: { token, lessonId: lesson.id } });
      await qc.invalidateQueries({ queryKey: ["student", token] });
      onCompleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1440px] px-6 pb-12 md:px-8">
      <div className="glass rounded-[2rem] p-4 shadow-deep">
        <div className="overflow-hidden rounded-[1.4rem] border border-border bg-ink">
          {v.kind === "iframe" ? (
            <iframe src={v.src} title={`Aula ${lesson.position}`} className="aspect-video w-full" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
          ) : (
            <video
              src={v.src}
              controls
              className="aspect-video w-full"
              onLoadedMetadata={(e) => { if (lesson.seconds && !lesson.completed) e.currentTarget.currentTime = lesson.seconds; }}
              onTimeUpdate={(e) => {
                const t = Math.floor(e.currentTarget.currentTime);
                if (Math.abs(t - lastSaved.current) >= 5) {
                  lastSaved.current = t;
                  void save({ data: { token, lessonId: lesson.id, seconds: t } });
                }
              }}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4">
          <p className="font-display text-xl font-bold">Aula {lesson.position}</p>
          <div className="flex flex-wrap gap-3">
            {lesson.completed ? (
              <button className="btn-primary" onClick={onCompleted}>Conversar com a tutora</button>
            ) : (
              <button className="btn-primary" disabled={busy || !canComplete} onClick={finish}>{busy ? "A guardar…" : "Marcar como concluída"}</button>
            )}
            <button className="btn-ghost" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {err && <p className="px-4 pb-4 text-sm text-destructive">{err}</p>}
      </div>
    </section>
  );
}
