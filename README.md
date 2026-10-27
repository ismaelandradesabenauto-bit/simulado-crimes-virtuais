# Simulado: Crimes Virtuais e Cidadania Digital

Simulado interativo (5 questões) com correção imediata e ranking da turma.
Curso de Direito — UNAMA Rio Branco · Projeto EJA.

- `src/index.js` — Cloudflare Worker: serve a página e a API do ranking (`/api/resultados`).
- `wrangler.toml` — configuração do Worker e do KV `RESULTADOS` (namespace `resultados-simulado`).

## Publicar
No painel do Cloudflare: Workers & Pages → Create → Import a repository → escolha este repositório → Deploy.
A cada push na branch `main`, o Cloudflare publica a nova versão automaticamente.

## Zerar o ranking
Storage & Databases → KV → `resultados-simulado` → apague as chaves que começam com `r:`.
