// Simulado: Crimes Virtuais e Cidadania Digital — Cloudflare Worker
// Banco: D1 (binding DB). Senha do administrador: secret ADMIN_SENHA.
import PAGINA from "./pagina.html";
import { QUESTOES_PADRAO } from "./questoes-padrao.js";

const LIMITES = { questoes: 50, alternativas: 6, nome: 60 };
const CACHE_RANKING = "https://cache.interno/ranking";

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

const erro = (mensagem, status = 400) => json({ erro: mensagem }, status);

async function lerQuestoes(env) {
  const linha = await env.DB.prepare("SELECT valor, atualizado_em FROM config WHERE chave = 'questoes'").first();
  if (linha) {
    try { return { questoes: JSON.parse(linha.valor), versao: linha.atualizado_em }; } catch (e) {}
  }
  return { questoes: QUESTOES_PADRAO, versao: 0 };
}

function validarQuestoes(lista) {
  if (!Array.isArray(lista) || lista.length < 1) return "Cadastre pelo menos 1 questão.";
  if (lista.length > LIMITES.questoes) return `O limite é de ${LIMITES.questoes} questões.`;
  const texto = (v, max) => typeof v === "string" && v.trim().length <= max;
  for (let i = 0; i < lista.length; i++) {
    const q = lista[i], n = i + 1;
    if (!q || typeof q !== "object") return `Questão ${n} inválida.`;
    if (!texto(q.pergunta, 600) || !q.pergunta.trim()) return `Questão ${n}: escreva a pergunta.`;
    if (!texto(q.tema ?? "", 80)) return `Questão ${n}: o tema pode ter até 80 caracteres.`;
    if (!texto(q.contexto ?? "", 600)) return `Questão ${n}: o texto de apoio pode ter até 600 caracteres.`;
    if (!texto(q.comentario ?? "", 800)) return `Questão ${n}: o comentário pode ter até 800 caracteres.`;
    const alts = q.alternativas;
    if (!Array.isArray(alts) || alts.length < 2 || alts.length > LIMITES.alternativas)
      return `Questão ${n}: use de 2 a ${LIMITES.alternativas} alternativas.`;
    for (const a of alts) if (!texto(a, 300) || !a.trim()) return `Questão ${n}: preencha todas as alternativas.`;
    if (!Number.isInteger(q.correta) || q.correta < 0 || q.correta >= alts.length)
      return `Questão ${n}: marque a alternativa correta.`;
  }
  return null;
}

const limparQuestoes = (lista) =>
  lista.map((q) => ({
    tema: (q.tema || "").trim(),
    contexto: (q.contexto || "").trim(),
    pergunta: q.pergunta.trim(),
    alternativas: q.alternativas.map((a) => a.trim()),
    correta: q.correta,
    comentario: (q.comentario || "").trim()
  }));

async function hash(texto) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ehAdmin(req, env) {
  const recebida = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!recebida) return false;
  const ok = (await hash(recebida)) === (await hash(env.ADMIN_SENHA));
  if (!ok) await new Promise((r) => setTimeout(r, 600));
  return ok;
}

async function montarRanking(env) {
  const { results } = await env.DB.prepare(
    "SELECT nome, acertos, total, criado_em FROM resultados ORDER BY criado_em LIMIT 5000"
  ).all();
  const melhor = new Map();
  for (const r of results) {
    const chave = r.nome.trim().toLowerCase();
    const atual = melhor.get(chave);
    const nota = r.total ? r.acertos / r.total : 0;
    const notaAtual = atual ? atual.acertos / atual.total : -1;
    if (!atual || nota > notaAtual || (nota === notaAtual && r.acertos > atual.acertos)) melhor.set(chave, r);
  }
  return [...melhor.values()]
    .sort((a, b) => b.acertos / b.total - a.acertos / a.total || b.acertos - a.acertos || a.criado_em - b.criado_em)
    .map((r) => ({ nome: r.nome, acertos: r.acertos, total: r.total, data: r.criado_em }));
}

const limparCacheRanking = () => caches.default.delete(CACHE_RANKING).catch(() => {});

async function pagina(env) {
  const dados = await lerQuestoes(env);
  const seguro = JSON.stringify(dados).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, " ");
  return new Response(PAGINA.replace('"__DADOS__"', seguro), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin"
    }
  });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const caminho = url.pathname.replace(/\/+$/, "") || "/";
    const metodo = req.method;

    try {
      // ---------- Público ----------
      if (caminho === "/api/ranking" && metodo === "GET") {
        const cache = caches.default;
        const emCache = await cache.match(CACHE_RANKING);
        if (emCache) return emCache;
        const resp = new Response(JSON.stringify(await montarRanking(env)), {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=8" }
        });
        ctx.waitUntil(cache.put(CACHE_RANKING, resp.clone()));
        return resp;
      }

      if (caminho === "/api/resultados" && metodo === "POST") {
        const corpo = await req.json().catch(() => null);
        const nome = typeof corpo?.nome === "string" ? corpo.nome.trim().replace(/\s+/g, " ").slice(0, LIMITES.nome) : "";
        if (nome.length < 2) return erro("Digite um nome com pelo menos 2 letras.");
        const { questoes, versao } = await lerQuestoes(env);
        if (Number(corpo?.versao) !== versao)
          return erro("As questões foram atualizadas pelo professor. Recarregue a página e refaça o simulado.", 409);
        const respostas = Array.isArray(corpo?.respostas) ? corpo.respostas : [];
        if (respostas.length !== questoes.length) return erro("Responda todas as questões.");
        const acertos = questoes.reduce((s, q, i) => s + (respostas[i] === q.correta ? 1 : 0), 0);
        await env.DB.prepare("INSERT INTO resultados (nome, acertos, total, criado_em) VALUES (?, ?, ?, ?)")
          .bind(nome, acertos, questoes.length, Date.now()).run();
        ctx.waitUntil(limparCacheRanking());
        return json({ acertos, total: questoes.length }, 201);
      }

      // ---------- Administrador ----------
      if (caminho.startsWith("/api/admin")) {
        if (!env.ADMIN_SENHA) return erro("A senha de administrador ainda não foi configurada no Cloudflare (secret ADMIN_SENHA).", 503);
        if (!(await ehAdmin(req, env))) return erro("Senha incorreta.", 401);

        if (caminho === "/api/admin/entrar" && metodo === "POST") return json({ ok: true });

        if (caminho === "/api/admin/resultados" && metodo === "GET") {
          const { results } = await env.DB.prepare(
            "SELECT id, nome, acertos, total, criado_em AS data FROM resultados ORDER BY criado_em DESC LIMIT 5000"
          ).all();
          return json(results);
        }
        if (caminho === "/api/admin/resultados" && metodo === "DELETE") {
          const r = await env.DB.prepare("DELETE FROM resultados").run();
          ctx.waitUntil(limparCacheRanking());
          return json({ apagados: r.meta.changes });
        }
        const m = caminho.match(/^\/api\/admin\/resultados\/(\d+)$/);
        if (m && metodo === "DELETE") {
          const r = await env.DB.prepare("DELETE FROM resultados WHERE id = ?").bind(Number(m[1])).run();
          ctx.waitUntil(limparCacheRanking());
          return json({ apagados: r.meta.changes });
        }

        if (caminho === "/api/admin/questoes" && metodo === "GET") return json(await lerQuestoes(env));
        if (caminho === "/api/admin/questoes" && metodo === "PUT") {
          const corpo = await req.json().catch(() => null);
          const problema = validarQuestoes(corpo?.questoes);
          if (problema) return erro(problema);
          const versao = Date.now();
          await env.DB.prepare(
            "INSERT INTO config (chave, valor, atualizado_em) VALUES ('questoes', ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em"
          ).bind(JSON.stringify(limparQuestoes(corpo.questoes)), versao).run();
          return json(await lerQuestoes(env));
        }
        if (caminho === "/api/admin/questoes/restaurar" && metodo === "POST") {
          await env.DB.prepare("DELETE FROM config WHERE chave = 'questoes'").run();
          return json(await lerQuestoes(env));
        }
        return erro("Rota não encontrada.", 404);
      }

      if (caminho.startsWith("/api/")) return erro("Rota não encontrada.", 404);
      if (metodo !== "GET" && metodo !== "HEAD") return erro("Método não permitido.", 405);
      return pagina(env);
    } catch (e) {
      return erro("Erro no servidor. Tente de novo em instantes.", 500);
    }
  }
};
