# Simulado: Crimes Virtuais e Cidadania Digital

Simulado interativo com correção imediata, ranking da turma e painel do professor.
Curso de Direito — UNAMA Rio Branco · Projeto EJA.

## Endereços
- `/` — simulado para os alunos (funciona em Android e iPhone)
- `/admin` — painel do professor (protegido por senha)

## Painel do professor (/admin)
- **Resultados:** lista todas as tentativas, remove uma por uma ou zera o ranking.
- **Questões:** adiciona, edita, reordena e exclui questões (2 a 6 alternativas cada); "Restaurar originais" volta às 5 questões do PDF.

### Configurar a senha (uma vez)
Cloudflare → Workers & Pages → `simulado-crimes-virtuais` → Settings → Variables and Secrets → **Add**
- Type: **Secret**
- Name: `ADMIN_SENHA`
- Value: a senha que você quiser

## Estrutura
- `src/index.js` — Worker: página, API do ranking e API do painel.
- `src/pagina.html` — interface (simulado + painel).
- `src/questoes-padrao.js` — questões originais do PDF.
- `wrangler.toml` — configuração; banco D1 `simulado-crimes-virtuais` no binding `DB`.

Cada push na branch `main` é publicado automaticamente pelo Cloudflare.
