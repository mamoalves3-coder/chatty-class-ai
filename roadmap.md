# Roadmap

- [ ] Separar Entrar/Registo e guardar classe e telefone; entrada aprovada no mesmo dispositivo.
- [ ] Mostrar referência cursiva da letra pedida junto à prancheta.
- [ ] Setas de voltar em todas as telas; verificar acesso e desenho.

- [x] Voz da Tia Iris fiável: TTS gerado no servidor (rota /api/tts, voz Gemini via Lovable AI Gateway) com fallback para speechSynthesis do navegador. Nota: edge-tts é Python e não corre no browser; usámos o equivalente no nosso sistema.
- [x] Testar fluxo completo: botão de ativação → saudação → pergunta falada (verificado: pedido /api/tts disparado, WAV válido, sem erros)
