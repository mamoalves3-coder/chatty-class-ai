import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { adminLogin } from "@/lib/school.functions";

export const ADMIN_KEY = "ai_admin_token";

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const login = useServerFn(adminLogin);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await login({ data: { email, password } });
      if (!r.token) return setError(r.error ?? "Erro");
      localStorage.setItem(ADMIN_KEY, r.token);
      setOpen(false);
      navigate({ to: "/admin" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="relative z-10 mx-auto flex max-w-[1440px] items-center justify-between px-6 py-7 md:px-8">
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-4 text-left">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-logo shadow-glow">
            <span className="font-display text-xl font-black text-ink">A</span>
          </div>
          <div>
            <p className="font-display text-xl font-extrabold leading-none tracking-tight">Aprender Infantil</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.32em] text-primary/70">escola digital viva</p>
          </div>
        </button>
        {right}
      </header>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="glass w-full max-w-sm rounded-[1.8rem] bg-popover/90 p-7 shadow-deep"
          >
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">acesso restrito</p>
            <h2 className="mt-1 text-2xl font-black">Administrador</h2>
            <label className="mt-5 block text-sm text-muted-foreground">
              E-mail
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1" />
            </label>
            <label className="mt-3 block text-sm text-muted-foreground">
              Senha
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field mt-1" />
            </label>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-6 flex gap-3">
              <button disabled={busy} className="btn-primary flex-1">{busy ? "A entrar…" : "Entrar"}</button>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Fechar</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background font-body text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-page" />
      <div className="anim-drift diag-clip pointer-events-none absolute -top-32 left-[6%] h-[420px] w-[640px] -rotate-[22deg] bg-primary/10 blur-2xl" />
      <div className="diag-clip2 pointer-events-none absolute top-[38%] -right-24 h-[380px] w-[560px] rotate-[16deg] bg-secondary/10 blur-2xl" />
      <div className="relative">{children}</div>
    </div>
  );
}
