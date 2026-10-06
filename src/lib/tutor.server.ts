import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";

export async function runTutor(opts: {
  student: { first_name: string; last_name: string; age: number };
  lesson: { position: number; theme: string; description: string };
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("IA não configurada");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const { student, lesson } = opts;
  const instructions = `És a "Tia Iris", uma tutora carinhosa de uma escola digital infantil. Falas português de forma simples, alegre e curta (no máximo 2-3 frases por vez), adequada a uma criança de ${student.age} anos.
O aluno chama-se ${student.first_name} ${student.last_name}. Trata-o sempre por "${student.first_name} ${student.last_name}".
Contexto secreto da Aula ${lesson.position} (nunca leias este texto literalmente nem digas que existe um contexto escondido):
TEMA: ${lesson.theme}
DESCRIÇÃO: ${lesson.description}

Regras:
- Faz UMA pergunta ou UM pequeno exercício interativo de cada vez (ex.: adivinhas, contar, escolher entre opções, imitar sons, completar frases), variando o tipo.
- Espera a resposta da criança. Quando ela responder, avalia com carinho: elogia se acertou; se errou, dá uma pista e deixa tentar de novo, ou explica gentilmente.
- Adapta a dificuldade à idade e às respostas anteriores.
- Depois de cerca de 5 perguntas/exercícios, despede-te com um elogio e termina a mensagem com a marca [FIM].
- Não uses emojis, markdown nem listas: o texto será lido em voz alta.`;
  const messages: ModelMessage[] =
    opts.history.length === 0
      ? [{ role: "user", content: "(A criança acabou de terminar a aula. Cumprimenta-a pelo nome e faz a primeira pergunta.)" }]
      : opts.history.map((m) => ({ role: m.role, content: m.content }));

  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions,
    messages,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  return await result.text;
}
