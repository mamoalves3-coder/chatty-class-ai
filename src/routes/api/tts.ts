import { createFileRoute } from "@tanstack/react-router";
import { requestSpeech, type SpeechConfig } from "@/lib/speech-request";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { token?: string; text?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Pedido inválido" }, { status: 400 });
        }
        const text = (body.text ?? "").trim();
        if (!body.token || !text || text.length > 1200) {
          return Response.json({ error: "Pedido inválido" }, { status: 400 });
        }
        // Only approved students may use the voice.
        const { studentByToken } = await import("@/lib/school.server");
        const student = await studentByToken(body.token);
        if (!student || student.status !== "approved") {
          return Response.json({ error: "Não autorizado" }, { status: 401 });
        }
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: "Voz não configurada" }, { status: 500 });
        const config: SpeechConfig = {
          baseURL: "https://ai.gateway.lovable.dev",
          apiKey,
          model: "google/gemini-3.1-flash-tts-preview",
          format: "gemini",
          voice: "Kore",
        };
        const spoken = `Diz com alegria e devagar, como uma professora carinhosa a falar com uma criança pequena, em português de Portugal: ${text}`;
        const upstream = await requestSpeech(config, spoken, true);
        if (!upstream.ok || !upstream.body) {
          const err = await upstream.text().catch(() => "");
          console.error(`TTS falhou [${upstream.status}]: ${err}`);
          return Response.json({ error: `Voz falhou [${upstream.status}]` }, { status: upstream.status });
        }
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "content-type": upstream.headers.get("content-type") ?? "audio/wav",
            "cache-control": "no-cache",
          },
        });
      },
    },
  },
});
