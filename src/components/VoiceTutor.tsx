import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { tutorTurn } from "@/lib/school.functions";

type Msg = { role: "user" | "assistant"; content: string };
type Phase = "drawing" | "thinking" | "speaking" | "listening" | "idle" | "done" | "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRecognition(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const W = window as any;
  const C = W.SpeechRecognition || W.webkitSpeechRecognition;
  return C ? new C() : null;
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const s = window.speechSynthesis;
    const v = s.getVoices();
    if (v.length) return resolve(v);
    const t = setTimeout(() => resolve(s.getVoices()), 1500);
    s.onvoiceschanged = () => {
      clearTimeout(t);
      resolve(s.getVoices());
    };
  });
}

let blocked = false;
export function unlockSpeech() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.speak(u);
  window.speechSynthesis.resume();
  blocked = false;
}

function speakOne(text: string, voice: SpeechSynthesisVoice | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    const s = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "pt-PT";
    u.rate = 0.95;
    u.pitch = 1.15;
    u.volume = 1;
    let started = false;
    let finished = false;
    const end = (ok: boolean) => {
      if (finished) return;
      finished = true;
      resolve(ok);
    };
    u.onstart = () => (started = true);
    u.onend = () => end(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    u.onerror = (e: any) => end(e?.error !== "not-allowed");
    s.speak(u);
    s.resume();
    // If the browser never starts (blocked), give up after 4s.
    setTimeout(() => !started && end(false), 4000);
    // Safety: never hang more than ~20s per sentence.
    setTimeout(() => end(true), 20000);
  });
}

async function speak(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const voices = await loadVoices();
  const v =
    voices.find((x) => x.lang === "pt-PT") ||
    voices.find((x) => x.lang === "pt-BR") ||
    voices.find((x) => x.lang.toLowerCase().startsWith("pt"));
  const s = window.speechSynthesis;
  if (s.speaking || s.pending) s.cancel();
  await new Promise((r) => setTimeout(r, 120));
  // Chrome cuts long utterances: speak sentence by sentence.
  const parts = text.match(/[^.!?]+[.!?]*/g)?.map((p) => p.trim()).filter(Boolean) ?? [text];
  for (const p of parts) {
    const ok = await speakOne(p, v);
    if (!ok) {
      blocked = true;
      return false;
    }
  }
  return true;
}

export function VoiceTutor({
  token,
  lessonId,
  lessonNumber,
  studentName,
  onClose,
}: {
  token: string;
  lessonId: string;
  lessonNumber: number;
  studentName: string;
  onClose: () => void;
}) {
  const turn = useServerFn(tutorTurn);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<Phase>("thinking");
  const [error, setError] = useState<string | null>(null);
  const [canListen, setCanListen] = useState(true);
  const alive = useRef(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  const retries = useRef(0);
  const listen = useCallback((history: Msg[]) => {
    const rec = getRecognition();
    if (!rec) {
      setCanListen(false);
      setPhase("idle");
      return;
    }
    recRef.current = rec;
    rec.lang = "pt-PT";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let got = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      got = true;
      retries.current = 0;
      const text = e.results[0][0].transcript as string;
      void send(history, text);
    };
    let failed = false;
    const fail = () => {
      if (failed || got || !alive.current) return;
      failed = true;
      if (retries.current < 2) {
        retries.current++;
        setTimeout(() => alive.current && listen(history), 400);
      } else setPhase("idle");
    };
    rec.onerror = fail;
    rec.onend = fail;
    setPhase("listening");
    try {
      rec.start();
    } catch {
      setPhase("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = useCallback(
    async (history: Msg[], drawing?: string) => {
      setPhase("thinking");
      setError(null);
      try {
        const r = await turn({ data: { token, lessonId, history, drawing } });
        if (!alive.current) return;
        if (r.error || !r.text) {
          setError(r.error ?? "Sem resposta");
          setPhase("error");
          return;
        }
        const done = r.text.includes("[FIM]");
        const wantsDrawing = r.text.includes("[DESENHO]");
        let clean = r.text.replace("[FIM]", "").replace(/\[DESENHO\]/g, "").trim();
        if (done && r.dayDone) clean += ` ${studentName}, por hoje é tudo, até amanhã, prática tudo o que você aprendeu!`;
        const next = [...history, { role: "assistant" as const, content: clean }];
        setMsgs(next);
        if (wantsDrawing && !done) setPhase("drawing");
        else setPhase("speaking");
        await speak(clean);
        if (!alive.current) return;
        if (done) setPhase("done");
        else if (!wantsDrawing) listen(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
        setPhase("error");
      }
    },
    [turn, token, lessonId, listen, studentName],
  );

  const send = useCallback(
    async (history: Msg[], text: string) => {
      const next = [...history, { role: "user" as const, content: text }];
      setMsgs(next);
      await ask(next);
    },
    [ask],
  );

  const sendDrawing = useCallback(
    async (dataUrl: string) => {
      window.speechSynthesis?.cancel();
      const r = recRef.current;
      if (r) {
        r.onend = null;
        r.onerror = null;
        r.onresult = null;
        r.abort?.();
      }
      const next = [...msgs, { role: "user" as const, content: "(a criança enviou um desenho da lousa)" }];
      setMsgs(next);
      await ask(next, dataUrl);
    },
    [msgs, ask],
  );

  useEffect(() => {
    alive.current = true;
    void ask([]);
    return () => {
      alive.current = false;
      recRef.current?.abort?.();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const last = [...msgs].reverse().find((m) => m.role === "assistant");
  const status =
    phase === "thinking" ? "a pensar…" : phase === "speaking" ? "a falar" : phase === "listening" ? "a ouvir-te…" : phase === "done" ? "sessão terminada" : phase === "drawing" ? "desenha na lousa" : phase === "error" ? "erro" : "à tua espera";

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink/80 p-4 backdrop-blur-md">
      <div className="mx-auto grid max-w-5xl gap-8 py-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="glass relative rounded-[2rem] p-8 shadow-deep">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-success to-accent font-display font-bold text-ink">I</div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">tutora de voz · {status}</p>
          </div>
          <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-primary/70">Aula {lessonNumber} · {studentName}</p>

          <div className="relative mx-auto mt-10 grid h-40 w-40 place-items-center">
            {(phase === "listening" || phase === "speaking") && (
              <>
                <span className="anim-ring absolute inset-0 rounded-full border-2 border-primary" />
                <span className="anim-ring2 absolute inset-0 rounded-full border-2 border-primary" />
              </>
            )}
            <div className="grid h-28 w-28 place-items-center rounded-full bg-gradient-logo shadow-glow">
              <div className="flex h-12 items-center gap-1.5">
                {[10, 14, 8, 12, 9].map((h, i) => (
                  <span
                    key={i}
                    className={`w-2 rounded-full bg-ink ${phase === "speaking" || phase === "listening" ? "anim-wave" : ""}`}
                    style={{ height: `${h * 3}px`, animationDelay: `${i * 0.12}s` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {phase === "idle" && canListen && (
              <button className="btn-primary" onClick={() => listen(msgs)}>🎙 Tocar para responder</button>
            )}
            {phase === "error" && (
              <button className="btn-primary" onClick={() => ask(msgs[msgs.length - 1]?.role === "user" ? msgs : msgs)}>Tentar de novo</button>
            )}
            {phase === "done" && <button className="btn-primary" onClick={onClose}>Voltar à trilha</button>}
            {phase !== "done" && (
              <button className="btn-ghost" onClick={onClose}>Terminar conversa</button>
            )}
          </div>

          {phase !== "done" && <DrawingBoard onSubmit={sendDrawing} disabled={phase === "thinking"} />}
          {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
        </div>

        <div className="space-y-4">
          <p className="font-display text-3xl font-black leading-snug">
            {last ? `"${last.content}"` : "A tutora está a preparar a primeira pergunta…"}
          </p>
          <div className="glass max-h-[50vh] space-y-3 overflow-y-auto rounded-[1.6rem] p-5">
            {msgs.map((m, i) => (
              <p key={i} className={m.role === "assistant" ? "text-foreground" : "text-right text-primary"}>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {m.role === "assistant" ? "Tia Iris" : "Tu"}
                </span>
                <br />
                {m.content}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const INKS = ["#22d3ee", "#34d399", "#f472b6", "#facc15", "#ffffff"];

function DrawingBoard({ onSubmit, disabled }: { onSubmit: (dataUrl: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [ink, setInk] = useState<string>(INKS[0]!);
  const [empty, setEmpty] = useState(true);

  const clear = () => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, c.width, c.height);
    setEmpty(true);
  };
  useEffect(clear, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height] as const;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const [x, y] = pos(e);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    setEmpty(false);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => (drawing.current = false);

  return (
    <div className="mt-6 space-y-3">
      <canvas
        ref={ref}
        width={640}
        height={440}
        className="aspect-[16/11] w-full touch-none rounded-2xl border-2 border-primary/60 shadow-glow"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {INKS.map((c) => (
          <button
            key={c}
            aria-label="cor da tinta"
            onClick={() => setInk(c)}
            className={`h-10 w-10 rounded-full border-4 ${ink === c ? "border-foreground" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
        <button className="btn-ghost" onClick={clear} aria-label="apagar">🧽</button>
        <button
          className="btn-primary text-2xl"
          aria-label="pronto"
          disabled={empty || disabled}
          onClick={() => { onSubmit(ref.current!.toDataURL("image/jpeg", 0.7)); clear(); }}
        >
          ✅
        </button>
      </div>
    </div>
  );
}
