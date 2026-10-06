import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { tutorTurn } from "@/lib/school.functions";

type Msg = { role: "user" | "assistant"; content: string };
type Phase = "thinking" | "speaking" | "listening" | "idle" | "done" | "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRecognition(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const W = window as any;
  const C = W.SpeechRecognition || W.webkitSpeechRecognition;
  return C ? new C() : null;
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang === "pt-PT") || voices.find((x) => x.lang.startsWith("pt"));
    if (v) u.voice = v;
    u.lang = v?.lang ?? "pt-PT";
    u.rate = 0.95;
    u.pitch = 1.15;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
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
  const [typed, setTyped] = useState("");
  const [canListen, setCanListen] = useState(true);
  const alive = useRef(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

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
      const text = e.results[0][0].transcript as string;
      void send(history, text);
    };
    rec.onerror = () => alive.current && !got && setPhase("idle");
    rec.onend = () => alive.current && !got && setPhase("idle");
    setPhase("listening");
    try {
      rec.start();
    } catch {
      setPhase("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = useCallback(
    async (history: Msg[]) => {
      setPhase("thinking");
      setError(null);
      try {
        const r = await turn({ data: { token, lessonId, history } });
        if (!alive.current) return;
        if (r.error || !r.text) {
          setError(r.error ?? "Sem resposta");
          setPhase("error");
          return;
        }
        const done = r.text.includes("[FIM]");
        const clean = r.text.replace("[FIM]", "").trim();
        const next = [...history, { role: "assistant" as const, content: clean }];
        setMsgs(next);
        setPhase("speaking");
        await speak(clean);
        if (!alive.current) return;
        if (done) setPhase("done");
        else listen(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
        setPhase("error");
      }
    },
    [turn, token, lessonId, listen],
  );

  const send = useCallback(
    async (history: Msg[], text: string) => {
      const next = [...history, { role: "user" as const, content: text }];
      setMsgs(next);
      await ask(next);
    },
    [ask],
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
    phase === "thinking" ? "a pensar…" : phase === "speaking" ? "a falar" : phase === "listening" ? "a ouvir-te…" : phase === "done" ? "sessão terminada" : phase === "error" ? "erro" : "à tua espera";

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

          {(phase === "idle" || phase === "listening") && (
            <form
              className="mt-6 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!typed.trim()) return;
                recRef.current?.abort?.();
                const t = typed;
                setTyped("");
                void send(msgs, t);
              }}
            >
              <input className="field" placeholder="Ou escreve a tua resposta…" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button className="btn-ghost">Enviar</button>
            </form>
          )}
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
