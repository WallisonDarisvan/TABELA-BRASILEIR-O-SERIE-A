# ⚽ Tabela Interativa do Brasileirão Série A (Com Server-Sent Events)

Aplicação web em **tema Branco e Verde**, moderna, limpa e responsiva, que extrai e exibe a classificação do Brasileirão Série A diretamente da estrutura oficial do [ge.globo](https://ge.globo.com/futebol/brasileirao-serie-a/) com **atualização automática em tempo real via Server-Sent Events (SSE)**.

Focada estritamente nas colunas principais solicitadas:
- **POS** (Posição oficial com variação ▲ ▼ • e faixa da zona)
- **CLASSIFICAÇÃO** (Escudo SVG + Nome do clube + Sigla)
- **P** (Pontos)
- **J** (Jogos)
- **V** (Vitórias)

---

## ⚡ Atualização Automática em Tempo Real (SSE)

- **Fluxo Contínuo Nativo**: O backend em Node.js mantém um canal aberto de eventos via HTTP (`text/event-stream`).
- **Detecção de Mudanças**: O servidor verifica periodicamente o GE (a cada 30 segundos). Quando qualquer dado de pontos, jogos, vitórias ou posição for alterado, ele transmite imediatamente um evento para todos os navegadores abertos.
- **Sem Recarregar a Página**: A tabela na tela pisca sutilmente em verde claro para indicar a chegada dos novos dados, sem necessidade de refresh manual.
- **Reconexão Automática**: Se a conexão oscilar, a API nativa `EventSource` reconecta automaticamente.

---

## 🚀 Como Iniciar

No terminal:
```bash
npm start
```
ou:
```bash
node server.js
```

Abra no navegador:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ✨ Recursos

- **Ordenação Interativa**: Clique em **P**, **J**, **V** ou **POS** para ordenar a qualquer momento.
- **Tema Branco & Verde**: Identidade esportiva premium, limpa e com ótima legibilidade.
- **Comparador Direto**: Clique em qualquer linha para abrir um card comparando os números do time frente ao líder.
- **Cache Local & Fallback**: Garantia de funcionamento mesmo em oscilações externas de rede.
