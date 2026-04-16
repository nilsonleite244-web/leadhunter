"use strict";
const express    = require("express");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const axios      = require("axios");
const admin      = require("firebase-admin");
const path       = require("path");
const { Pool }   = require("pg");
require("dotenv").config();

// ── FIREBASE INIT (não bloqueia startup) ──────────────────────────────────────
let db = null;
let firebaseOk = false;

function leadsCol()      { return db.collection("leads_extra"); }
function assinantesCol() { return db.collection("assinantes"); }

function initFirebase() {
  try {
    let credential;
    try {
      credential = admin.credential.cert(require("./firebase-service-account.json"));
      console.log("[Firebase] Credencial carregada via arquivo JSON");
    } catch {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT não definida nas env vars");
      // JSON.parse já converte \n em newlines reais — não fazer replace antes
      const parsed = JSON.parse(raw);
      credential = admin.credential.cert(parsed);
      console.log("[Firebase] Credencial carregada via env var");
    }
    admin.initializeApp({ credential });
    db = admin.firestore();
    firebaseOk = true;
    console.log("[Firebase] Inicializado — projeto: leadhunter-eb847");
  } catch(e) {
    console.error("[Firebase] ERRO ao inicializar:", e.message);
    console.error("[Firebase] Defina FIREBASE_SERVICE_ACCOUNT nas variáveis de ambiente");
    // Não chama process.exit — servidor continua e healthcheck responde OK
  }
}

// Middleware: bloqueia rotas que precisam do Firebase se ele não inicializou
function requireFirebase(req, res, next) {
  if (!firebaseOk) return res.status(503).json({ error: "Firebase não inicializado. Verifique FIREBASE_SERVICE_ACCOUNT nas env vars do Railway." });
  next();
}

// ── POSTGRESQL (Supabase) — CNPJ leads ───────────────────────────────────────
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
  pool.query("SELECT 1").then(() => console.log("[PostgreSQL] Conectado — Supabase")).catch(e => console.warn("[PostgreSQL] Aviso:", e.message));
} else {
  console.warn("[PostgreSQL] DATABASE_URL não definida — queries de CNPJ desativadas");
}
function pgQuery(sql, params) {
  if (!pool) return Promise.reject(new Error("DATABASE_URL não configurada"));
  return pool.query(sql, params);
}

// ── EXPRESS ──────────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 60000, max: 300, message: { error: "Muitas requisicoes" } }));

process.on("uncaughtException",  e => console.error("[uncaughtException]",  e.message));
process.on("unhandledRejection", e => console.error("[unhandledRejection]", e));

// ── LIMITES POR PLANO ─────────────────────────────────────────────────────────
const LIMITES_PLANO  = { mensal: 150, trimestral: 300, vitalicio: 600 };
const PLANOS_LABEL   = { mensal: "Básico", trimestral: "Pro", vitalicio: "Alpha Member" };

// ── HELPERS ──────────────────────────────────────────────────────────────────
function paginate(req) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

// Retorna limite diário do assinante (null = sem limite = admin)
function getLimiteDiario(a) {
  if (!a) return null;
  return LIMITES_PLANO[a.plano] ?? null;
}

// Retorna quantos leads o assinante ainda pode ver hoje
function getRestanteHoje(a) {
  const limite = getLimiteDiario(a);
  if (limite === null) return Infinity;
  const hoje = new Date().toISOString().split("T")[0];
  const usadoHoje = a.leads_data === hoje ? (a.leads_hoje || 0) : 0;
  return Math.max(0, limite - usadoHoje);
}

// Incrementa contador do assinante no Firestore
function incrementarCota(a, count) {
  if (!a) return;
  const limite = getLimiteDiario(a);
  if (limite === null) return;
  const hoje = new Date().toISOString().split("T")[0];
  const usadoHoje = a.leads_data === hoje ? (a.leads_hoje || 0) : 0;
  const novoTotal = Math.min(usadoHoje + count, limite);
  assinantesCol().doc(a.id).update({ leads_hoje: novoTotal, leads_data: hoje }).catch(() => {});
}

// ── CACHE DE LEADS GERADOS POR DIA ───────────────────────────────────────────
// Cria tabela se não existir (executa uma vez no startup)
if (pool) {
  pool.query(`
    CREATE TABLE IF NOT EXISTS leads_gerados (
      id               SERIAL PRIMARY KEY,
      assinante_token  TEXT NOT NULL,
      data_geracao     DATE NOT NULL DEFAULT CURRENT_DATE,
      lead_tipo        TEXT NOT NULL,
      lead_id          TEXT NOT NULL,
      lead_json        JSONB NOT NULL,
      UNIQUE(assinante_token, data_geracao, lead_id)
    );
    CREATE INDEX IF NOT EXISTS idx_leads_gerados_tok_data
      ON leads_gerados(assinante_token, data_geracao);
  `).catch(e => console.warn("[leads_gerados] Aviso ao criar tabela:", e.message));
}

// Salva leads entregues no cache (sem bloquear a resposta)
function salvarLeadsGerados(token, tipo, leads) {
  if (!pool || !token || !leads?.length) return;
  const hoje = new Date().toISOString().split("T")[0];
  const values = leads.map(l => {
    const id = String(l.cnpj || l.id || l.instagram || l.nome || Math.random());
    const json = JSON.stringify(l).replace(/'/g, "''");
    return `('${token}','${hoje}','${tipo}','${id.slice(0,200)}','${json}')`;
  }).join(",");
  pool.query(
    `INSERT INTO leads_gerados (assinante_token, data_geracao, lead_tipo, lead_id, lead_json)
     VALUES ${values} ON CONFLICT DO NOTHING`
  ).catch(() => {});
}

const SOCIAL_DOMAINS = ["wa.me","whatsapp","instagram.com","facebook.com","linktr.ee","tiktok.com","youtube.com","bio.site","hotmart","kirvano"];
function hasOwnWebsite(website) {
  if (!website) return false;
  const w = website.toLowerCase();
  return !SOCIAL_DOMAINS.some(d => w.includes(d));
}

function extractHandle(instagram) {
  if (!instagram) return null;
  const m = instagram.match(/instagram\.com\/([A-Za-z0-9._]{2,40})/i);
  if (m) return m[1];
  const m2 = instagram.match(/^@?([A-Za-z0-9._]{2,40})$/);
  if (m2) return m2[1];
  return null;
}

// Converte doc Firestore → formato da API (compatível com frontend)
function docToLead(id, d) {
  const handle = d.instagram_handle || extractHandle(d.instagram);
  return {
    id,
    razao_social:    d.nome,
    nome_fantasia:   d.nome,
    cnae_descricao:  d.segmento,
    whatsapp_url:    d.whatsapp || null,
    instagram_url:   handle ? `https://instagram.com/${handle}` : null,
    municipio_nome:  d.cidade  || null,
    uf:              d.estado  || null,
    website:         d.website || null,
    funcionarios:    d.funcionarios || null,
    receita:         d.receita || null,
    ddd_municipio:   null,
    email:           d.email   || null,
    cnpj:            d.cnpj    || null,
  };
}

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const secret = process.env.API_SECRET;
  if (!secret) return next();

  const key = req.headers["x-api-key"] || (req.headers["authorization"] || "").replace("Bearer ", "");
  if (key === secret) return next();

  const token = req.headers["x-assinante-token"];
  if (!token) return res.status(401).json({ error: "Nao autorizado — faça login no LeadHunter" });

  assinantesCol().where("token", "==", token).where("status", "==", "ativo").limit(1).get()
    .then(snap => {
      if (snap.empty) return res.status(401).json({ error: "Assinatura inativa ou expirada" });
      const a = { id: snap.docs[0].id, ...snap.docs[0].data() };
      if (a.expira_em && a.expira_em.toDate && a.expira_em.toDate() < new Date()) {
        snap.docs[0].ref.update({ status: "expirado" }).catch(() => {});
        return res.status(401).json({ error: "Assinatura expirada" });
      }
      req.assinante = a;
      next();
    })
    .catch(() => res.status(500).json({ error: "Erro ao verificar assinatura" }));
}

async function verificarCota(req, res, count) {
  const a = req.assinante;
  const limite = getLimiteDiario(a);
  if (limite === null) return true; // admin — sem limite

  const hoje = new Date().toISOString().split("T")[0];
  const usadoHoje = a.leads_data === hoje ? (a.leads_hoje || 0) : 0;

  if (usadoHoje >= limite) {
    const msgs = {
      mensal:      "Faça upgrade para o plano Pro (300/dia) ou Alpha Member (600/dia).",
      trimestral:  "Faça upgrade para o plano Alpha Member para ter 600 leads/dia.",
      vitalicio:   "Você atingiu o limite diário do plano Alpha Member.",
    };
    res.status(429).json({
      error: `Limite de ${limite} leads/dia atingido no plano ${PLANOS_LABEL[a.plano] || a.plano}.`,
      cota: { limite, usado: usadoHoje, restante: 0 },
      upgrade: msgs[a.plano] || null,
    });
    return false;
  }

  incrementarCota(a, count);
  return true;
}

// ── ROTAS PÚBLICAS ────────────────────────────────────────────────────────────
app.get("/version", (req, res) => res.json({ v: "2.1.0", db: "firebase+postgresql" }));

app.get("/health", (req, res) => {
  // Responde imediatamente — Railway precisa de resposta rápida
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── LEADS (protegidos) ────────────────────────────────────────────────────────
app.use(["/leads", "/stats", "/whatsapp", "/auth", "/webhook", "/admin"], requireFirebase);
app.use(["/leads", "/stats", "/whatsapp"], authMiddleware);

// Rotas admin — exigem API_SECRET (somente o dono do sistema)
function adminMiddleware(req, res, next) {
  const secret = process.env.API_SECRET;
  if (!secret) return next(); // sem secret configurado, permite (dev)
  const key = req.headers["x-api-key"] || (req.headers["authorization"] || "").replace("Bearer ", "");
  if (key === secret) return next();
  return res.status(403).json({ error: "Acesso restrito ao administrador" });
}
app.use("/admin", adminMiddleware);

// GET /leads/instagram — busca no Supabase leads_extra
app.get("/leads/instagram", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco não configurado" });

    const a       = req.assinante;
    const isAdmin = !a; // admin usa x-api-key, não tem req.assinante
    const limite  = getLimiteDiario(a);

    // Bloqueia se já atingiu cota antes de qualquer query
    if (limite !== null) {
      const restante = getRestanteHoje(a);
      if (restante <= 0) {
        const msgs = {
          mensal:     "Faça upgrade para o plano Pro (300/dia) ou Alpha Member (600/dia).",
          trimestral: "Faça upgrade para o plano Alpha Member para ter 600 leads/dia.",
          vitalicio:  "Você atingiu o limite diário do plano Alpha Member.",
        };
        return res.status(429).json({
          error: `Limite de ${limite} leads/dia atingido no plano ${PLANOS_LABEL[a.plano] || a.plano}.`,
          cota: { limite, usado: limite, restante: 0 },
          upgrade: msgs[a.plano] || null,
        });
      }
    }

    // Capeia o limit pelo restante da cota (assinantes não podem pedir mais do que têm)
    const { page } = paginate(req);
    const restante = limite !== null ? getRestanteHoje(a) : 500;
    const reqLimit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const effectiveLimit = Math.min(reqLimit, restante);
    const offset = (page - 1) * reqLimit;

    const busca    = req.query.busca?.trim();
    const segmento = req.query.segmento?.trim();
    const cidade   = req.query.cidade?.trim();
    const apenasIG = req.query.apenas_ig === "true";
    const semIG    = req.query.sem_ig    === "true";

    const params = [];
    const where  = [];
    let p = 1;

    if (apenasIG) where.push("instagram IS NOT NULL AND instagram != ''");
    if (semIG)    where.push("(instagram IS NULL OR instagram = '') AND (whatsapp IS NOT NULL AND whatsapp != '')");
    if (busca)    { where.push(`nome ILIKE $${p}`);     params.push("%" + busca + "%");    p++; }
    if (segmento) { where.push(`segmento ILIKE $${p}`); params.push("%" + segmento + "%"); p++; }
    if (cidade)   { where.push(`cidade ILIKE $${p}`);   params.push("%" + cidade + "%");   p++; }

    const whereStr = where.length ? "WHERE " + where.join(" AND ") : "";

    // Admin recebe contagem real; assinantes nunca veem o total do banco
    const [countRes, dataRes] = await Promise.all([
      isAdmin
        ? pgQuery(`SELECT COUNT(*) FROM leads_extra ${whereStr}`, params)
        : Promise.resolve(null),
      pgQuery(
        `SELECT id, nome, segmento, cidade, estado, instagram, whatsapp, website, funcionarios, receita FROM leads_extra ${whereStr} ORDER BY md5(id::text || current_date::text) LIMIT $${p} OFFSET $${p+1}`,
        [...params, effectiveLimit, offset]
      ),
    ]);

    const rows = dataRes.rows.map(r => {
      const igRaw = r.instagram || "";
      const handleMatch = igRaw.match(/instagram\.com\/([A-Za-z0-9._]{2,40})/i);
      const handle = handleMatch
        ? handleMatch[1]
        : (igRaw.startsWith("@") ? igRaw.slice(1) : (/^[A-Za-z0-9._]{2,40}$/.test(igRaw) ? igRaw : null));
      return {
        id:            String(r.id),
        razao_social:  r.nome,
        nome_fantasia: r.nome,
        cnae_descricao: r.segmento,
        municipio_nome: r.cidade,
        uf:            r.estado,
        instagram_url: handle ? `https://instagram.com/${handle}` : (igRaw.startsWith("http") ? igRaw : null),
        whatsapp_url:  r.whatsapp,
        website:       r.website,
        funcionarios:  r.funcionarios,
        receita:       r.receita,
        email: null, cnpj: null, telefone1: null, ddd_municipio: null,
      };
    });

    // Debita cota e salva no cache do dia
    incrementarCota(a, rows.length);
    if (a) salvarLeadsGerados(a.token, 'instagram', rows);

    // Monta resposta — assinantes não recebem total real
    const hoje = new Date().toISOString().split("T")[0];
    const usadoAntes = a?.leads_data === hoje ? (a?.leads_hoje || 0) : 0;
    const cota = limite !== null ? {
      limite,
      usado:    Math.min(usadoAntes + rows.length, limite),
      restante: Math.max(0, limite - usadoAntes - rows.length),
      plano:    a.plano,
    } : null;

    // total e pages: admin vê real, assinante vê apenas baseado na cota restante
    const total = isAdmin ? parseInt(countRes.rows[0].count) : null;
    const pages = isAdmin ? Math.ceil(total / effectiveLimit) : null;

    res.json({ total, page, limit: effectiveLimit, pages, data: rows, cota });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/buscar — busca nos leads de CNPJ (PostgreSQL)
app.get("/leads/buscar", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco de CNPJ não configurado. Configure DATABASE_URL." });

    const a       = req.assinante;
    const isAdmin = !a;
    const limite  = getLimiteDiario(a);

    // Bloqueia se cota esgotada
    if (limite !== null) {
      const restante = getRestanteHoje(a);
      if (restante <= 0) {
        const msgs = {
          mensal:     "Faça upgrade para o plano Pro (300/dia) ou Alpha Member (600/dia).",
          trimestral: "Faça upgrade para o plano Alpha Member para ter 600 leads/dia.",
          vitalicio:  "Você atingiu o limite diário do plano Alpha Member.",
        };
        return res.status(429).json({
          error: `Limite de ${limite} leads/dia atingido no plano ${PLANOS_LABEL[a.plano] || a.plano}.`,
          cota: { limite, usado: limite, restante: 0 },
          upgrade: msgs[a.plano] || null,
        });
      }
    }

    const { page } = paginate(req);
    const restante = limite !== null ? getRestanteHoje(a) : 500;
    const reqLimit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
    const effectiveLimit = Math.min(reqLimit, restante);
    // Offset usa reqLimit (não effectiveLimit) para que a paginação não sobreponha
    // resultados quando a cota está prestes a se esgotar
    const offset = (page - 1) * reqLimit;

    const { uf, segmento: seg, busca, ddd, porte, apenas_com_email, apenas_com_telefone } = req.query;

    const params = [];
    const where  = [];
    let p = 1;

    where.push("situacao_cadastral = 2");

    if (uf)    { where.push(`uf = $${p++}`);                                                               params.push(uf.toUpperCase()); }
    if (seg)   { where.push(`cnae_descricao ILIKE $${p++}`);                                               params.push("%" + seg + "%"); }
    if (busca) { where.push(`(razao_social ILIKE $${p} OR nome_fantasia ILIKE $${p+1})`); params.push("%" + busca + "%", "%" + busca + "%"); p += 2; }
    if (ddd)   { where.push(`ddd_municipio = $${p++}`);                                                    params.push(ddd); }
    if (porte) { where.push(`porte = $${p++}`);                                                            params.push(porte.toUpperCase()); }
    if (req.query.tem_telefone   === "true" || apenas_com_telefone === "true") where.push("telefone1 IS NOT NULL AND telefone1 != ''");
    if (req.query.tem_email      === "true" || apenas_com_email    === "true") where.push("email IS NOT NULL AND email != ''");

    const whereStr = where.length ? "WHERE " + where.join(" AND ") : "";
    const cols = "cnpj, razao_social, nome_fantasia, cnae_descricao, porte, email, telefone1, ddd_municipio, municipio_nome, uf, nome_socio, score_completude";

    const [countRes, dataRes] = await Promise.all([
      isAdmin
        ? pgQuery(`SELECT COUNT(*) FROM leads ${whereStr}`, params)
        : Promise.resolve(null),
      pgQuery(`SELECT ${cols} FROM leads ${whereStr} ORDER BY ${isAdmin ? "score_completude DESC" : "md5(cnpj || current_date::text)"} LIMIT $${p++} OFFSET $${p++}`, [...params, effectiveLimit, offset]),
    ]);

    const data = dataRes.rows.map(r => ({
      id: r.cnpj, cnpj: r.cnpj,
      razao_social: r.razao_social, nome_fantasia: r.nome_fantasia,
      cnae_descricao: r.cnae_descricao, porte: r.porte,
      email: r.email, telefone1: r.telefone1,
      ddd_municipio: r.ddd_municipio, municipio_nome: r.municipio_nome,
      uf: r.uf, nome_socio: r.nome_socio,
      score_completude: r.score_completude,
    }));

    incrementarCota(a, data.length);
    if (a) salvarLeadsGerados(a.token, 'cnpj', data);

    const hoje = new Date().toISOString().split("T")[0];
    const usadoAntes = a?.leads_data === hoje ? (a?.leads_hoje || 0) : 0;
    const cota = limite !== null ? {
      limite,
      usado:    Math.min(usadoAntes + data.length, limite),
      restante: Math.max(0, limite - usadoAntes - data.length),
      plano:    a.plano,
    } : null;

    const total = isAdmin ? parseInt(countRes.rows[0].count) : null;
    const pages = isAdmin ? Math.ceil(total / effectiveLimit) : null;

    res.json({ total, page, limit: effectiveLimit, pages, data, cota });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/meus-leads — devolve leads já entregues hoje (sem debitar cota)
app.get("/leads/meus-leads", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco não configurado" });
    const a = req.assinante;
    if (!a) return res.status(401).json({ error: "Token inválido" });

    const tipo = req.query.tipo || null; // 'cnpj', 'instagram' ou null (todos)
    const hoje = new Date().toISOString().split("T")[0];

    const params = [a.token, hoje];
    let sql = `SELECT lead_tipo, lead_json FROM leads_gerados
               WHERE assinante_token = $1 AND data_geracao = $2`;
    if (tipo) { sql += ` AND lead_tipo = $3`; params.push(tipo); }
    sql += ` ORDER BY id ASC`;

    const r = await pool.query(sql, params);
    const cnpj      = r.rows.filter(x => x.lead_tipo === 'cnpj').map(x => x.lead_json);
    const instagram = r.rows.filter(x => x.lead_tipo === 'instagram').map(x => x.lead_json);

    res.json({ total: r.rows.length, cnpj, instagram });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/aleatorio — CNPJs aleatórios com telefone (sujeito à cota do plano)
app.get("/leads/aleatorio", async (req, res) => {
  try {
    const a      = req.assinante;
    const limite = getLimiteDiario(a);

    if (limite !== null) {
      const restante = getRestanteHoje(a);
      if (restante <= 0) {
        return res.status(429).json({
          error: `Limite de ${limite} leads/dia atingido no plano ${PLANOS_LABEL[a.plano] || a.plano}.`,
          cota: { limite, usado: limite, restante: 0 },
        });
      }
    }

    const maxReq  = Math.min(100, parseInt(req.query.limit) || 50);
    const restante = limite !== null ? getRestanteHoje(a) : 500;
    const effectiveLimit = Math.min(maxReq, restante);

    if (pool) {
      const cols = "cnpj, razao_social, nome_fantasia, cnae_descricao, porte, email, telefone1, ddd_municipio, municipio_nome, uf, nome_socio, score_completude";

      // CNPJs já vistos nesta sessão (enviados pelo frontend para excluir)
      const excludeRaw = (req.query.exclude || "").split(",").map(c => c.replace(/\D/g,"")).filter(c => c.length >= 11 && c.length <= 14);
      const excludeList = excludeRaw.slice(0, 500); // limite de segurança

      const qParams = [effectiveLimit];
      let whereExtra = "";
      if (excludeList.length) {
        const ph = excludeList.map((_, i) => `$${i + 2}`).join(",");
        whereExtra = ` AND cnpj NOT IN (${ph})`;
        qParams.push(...excludeList);
      }

      // TABLESAMPLE é muito mais rápido que ORDER BY RANDOM() em tabelas grandes.
      // Amostra ~5% da tabela e depois ordena aleatoriamente apenas esse subconjunto.
      // Se a amostra vier menor que o solicitado, fallback para RANDOM() completo.
      let r;
      try {
        r = await pgQuery(
          `SELECT ${cols} FROM leads TABLESAMPLE SYSTEM(5) WHERE situacao_cadastral=2 AND telefone1 IS NOT NULL AND telefone1 != ''${whereExtra} ORDER BY RANDOM() LIMIT $1`,
          qParams
        );
        // Se a amostra retornou menos que o pedido, tenta sem TABLESAMPLE
        if (r.rows.length < effectiveLimit) {
          r = await pgQuery(
            `SELECT ${cols} FROM leads WHERE situacao_cadastral=2 AND telefone1 IS NOT NULL AND telefone1 != ''${whereExtra} ORDER BY RANDOM() LIMIT $1`,
            qParams
          );
        }
      } catch {
        r = await pgQuery(
          `SELECT ${cols} FROM leads WHERE situacao_cadastral=2 AND telefone1 IS NOT NULL AND telefone1 != ''${whereExtra} ORDER BY RANDOM() LIMIT $1`,
          qParams
        );
      }
      const data = r.rows.map(row => ({
        id: row.cnpj, cnpj: row.cnpj, razao_social: row.razao_social,
        nome_fantasia: row.nome_fantasia, cnae_descricao: row.cnae_descricao,
        porte: row.porte, email: row.email, telefone1: row.telefone1,
        ddd_municipio: row.ddd_municipio, municipio_nome: row.municipio_nome,
        uf: row.uf, nome_socio: row.nome_socio,
      }));
      incrementarCota(a, data.length);
      const hoje = new Date().toISOString().split("T")[0];
      const usadoAntes = a?.leads_data === hoje ? (a?.leads_hoje || 0) : 0;
      const cota = limite !== null ? {
        limite, usado: Math.min(usadoAntes + data.length, limite),
        restante: Math.max(0, limite - usadoAntes - data.length), plano: a.plano,
      } : null;
      return res.json({ total: data.length, data, cota });
    }
    // Fallback Firebase
    const snap = await leadsCol().limit(effectiveLimit).get();
    const data = snap.docs.map(doc => docToLead(doc.id, doc.data()));
    incrementarCota(a, data.length);
    res.json({ total: data.length, data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/:id — busca por CNPJ no PostgreSQL primeiro, depois Firebase
app.get("/leads/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const cnpj = id.replace(/\D/g, "").padStart(14, "0");

    // Tenta PostgreSQL se parece CNPJ (só dígitos)
    if (pool && /^\d+$/.test(id)) {
      const r = await pgQuery("SELECT * FROM leads WHERE cnpj = $1", [cnpj]);
      if (r.rows.length) return res.json(r.rows[0]);
    }

    // Fallback: Firebase (leads_extra)
    const doc = await leadsCol().doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Lead não encontrado" });
    res.json({ id: doc.id, ...doc.data() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── STATS ────────────────────────────────────────────────────────────────────
app.get("/stats/geral", async (req, res) => {
  try {
    const a       = req.assinante;
    const isAdmin = !a;

    if (!isAdmin) {
      // Assinantes veem apenas info do próprio plano — NUNCA contagens do banco
      const limite = getLimiteDiario(a);
      const hoje   = new Date().toISOString().split("T")[0];
      const usadoHoje = a.leads_data === hoje ? (a.leads_hoje || 0) : 0;
      return res.json({
        plano:           a.plano,
        limite_diario:   limite,
        leads_hoje:      usadoHoje,
        restante_hoje:   limite !== null ? Math.max(0, limite - usadoHoje) : null,
        // Campos de UI sem revelar base real
        empresas_ativas: null,
        leads_instagram: null,
        com_email:       null,
        com_telefone:    null,
        total_cnpjs:     null,
        por_porte:       [],
        top_ufs:         [],
      });
    }

    // Admin: retorna contagens completas
    const pgPromises = pool ? [
      pgQuery("SELECT COUNT(*) FROM leads WHERE situacao_cadastral=2"),
      pgQuery("SELECT COUNT(*) FROM leads WHERE situacao_cadastral=2 AND email IS NOT NULL AND email != ''"),
      pgQuery("SELECT COUNT(*) FROM leads WHERE situacao_cadastral=2 AND telefone1 IS NOT NULL AND telefone1 != ''"),
      pgQuery("SELECT porte, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY porte ORDER BY total DESC"),
      pgQuery("SELECT uf, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY uf ORDER BY total DESC LIMIT 10"),
      pgQuery("SELECT COUNT(*) FROM leads_extra WHERE instagram IS NOT NULL AND instagram != ''"),
      pgQuery("SELECT COUNT(*) FROM leads_extra"),
    ] : [];

    const pgResults = await Promise.all(pgPromises).catch(() => []);

    res.json({
      total_cnpjs:     pgResults[0] ? parseInt(pgResults[0].rows[0].count) : 0,
      empresas_ativas: pgResults[0] ? parseInt(pgResults[0].rows[0].count) : 0,
      leads_instagram: pgResults[5] ? parseInt(pgResults[5].rows[0].count) : 0,
      com_email:       pgResults[1] ? parseInt(pgResults[1].rows[0].count) : 0,
      com_telefone:    pgResults[2] ? parseInt(pgResults[2].rows[0].count) : 0,
      leads_com_site:  pgResults[6] ? parseInt(pgResults[6].rows[0].count) : 0,
      por_porte:       pgResults[3] ? pgResults[3].rows : [],
      top_ufs:         pgResults[4] ? pgResults[4].rows : [],
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/stats/segmentos", async (req, res) => {
  try {
    // Busca todos e agrupa por segmento em memória (viável para até ~50k docs)
    const snap = await leadsCol().select("segmento").get();
    const counts = {};
    snap.docs.forEach(d => {
      const s = d.data().segmento || "outros";
      counts[s] = (counts[s] || 0) + 1;
    });
    const result = Object.entries(counts)
      .map(([segmento, total]) => ({ segmento, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/stats/ddd/:ddd", async (req, res) => {
  try {
    const ddd = req.params.ddd;
    if (!pool) return res.json({ ddd, total_leads: 0, top_segmentos: [], top_cidades: [] });
    const [totalRes, segRes, cidRes] = await Promise.all([
      pgQuery("SELECT COUNT(*) FROM leads WHERE situacao_cadastral=2 AND ddd_municipio=$1", [ddd]),
      pgQuery("SELECT cnae_descricao AS segmento, COUNT(*) AS total FROM leads WHERE situacao_cadastral=2 AND ddd_municipio=$1 GROUP BY cnae_descricao ORDER BY total DESC LIMIT 5", [ddd]),
      pgQuery("SELECT municipio_nome AS cidade, COUNT(*) AS total FROM leads WHERE situacao_cadastral=2 AND ddd_municipio=$1 GROUP BY municipio_nome ORDER BY total DESC LIMIT 5", [ddd]),
    ]);
    res.json({
      ddd,
      total_leads:    parseInt(totalRes.rows[0].count),
      top_segmentos:  segRes.rows,
      top_cidades:    cidRes.rows,
    });
  } catch(e) {
    res.json({ ddd: req.params.ddd, total_leads: 0, top_segmentos: [], top_cidades: [] });
  }
});


// ── WHATSAPP / EVOLUTION API ──────────────────────────────────────────────────
app.get("/whatsapp/qr", async (req, res) => {
  try {
    const url = process.env.EVOLUTION_URL, key = process.env.EVOLUTION_KEY;
    const inst = process.env.EVOLUTION_INSTANCE || "leadhunter";
    if (!url || !key) return res.status(400).json({ error: "EVOLUTION_URL ou EVOLUTION_KEY não configurados" });
    const r = await axios.get(`${url}/instance/qrcode/${inst}`, { headers: { apikey: key }, timeout: 10000 });
    res.json({ qr: r.data?.qrcode?.base64 || r.data?.base64 || null });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/whatsapp/status", async (req, res) => {
  try {
    const url = process.env.EVOLUTION_URL, key = process.env.EVOLUTION_KEY;
    const inst = process.env.EVOLUTION_INSTANCE || "leadhunter";
    const r = await axios.get(`${url}/instance/connectionState/${inst}`, { headers: { apikey: key }, timeout: 8000 });
    res.json({ connected: r.data?.instance?.state === "open", state: r.data?.instance?.state });
  } catch(e) {
    res.json({ connected: false, state: "error", error: e.message });
  }
});

// ── ASSINATURAS ───────────────────────────────────────────────────────────────
function gerarToken() {
  return require("crypto").randomBytes(32).toString("hex");
}

function detectarPlano(dados) {
  const txt = JSON.stringify(dados).toLowerCase();
  // vitalicio = Alpha Member R$267/mês (detecta por nome, keyword ou UUID do produto Kirvano)
  if (txt.includes("vitalicio") || txt.includes("vitalício") || txt.includes("lifetime")
    || txt.includes("alpha") || txt.includes("4f358cd8")) return "vitalicio";
  // trimestral = Pro R$147/mês
  if (txt.includes("trimestral") || txt.includes("quarterly") || txt.includes("3 meses")
    || txt.includes("bc35d3cd")) return "trimestral";
  return "mensal";
}

function calcularExpiracao(plano) {
  // Todos os planos são mensais — renovam via webhook a cada pagamento
  return new Date(Date.now() + 35 * 86400000);
}

async function processarPagamento(email, nome, txId, dados, plataforma) {
  const plano    = detectarPlano(dados);
  const expiraEm = calcularExpiracao(plano);
  const docRef   = assinantesCol().doc(email.toLowerCase().trim());
  const existing = await docRef.get();

  if (existing.exists) {
    await docRef.update({
      status: "ativo", plano, expira_em: expiraEm,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[${plataforma}] renovacao: ${email} → ${plano}`);
    return null;
  }

  const token = gerarToken();
  await docRef.set({
    email: email.toLowerCase().trim(), nome, status: "ativo", token, plano,
    ativado_em: admin.firestore.FieldValue.serverTimestamp(),
    expira_em: expiraEm, leads_hoje: 0, leads_data: null,
    kirvano_transaction_id: txId, updated_at: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`[${plataforma}] novo assinante: ${email} plano=${plano}`);
  return token;
}

async function enviarEmailBoasVindas(email, nome, token, plano) {
  if (!token) return;
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) { console.warn("[Email] BREVO_API_KEY não configurada"); return; }

  const planosLabel = { mensal: "Básico — R$97/mês", trimestral: "Pro — R$147/mês", vitalicio: "Alpha Member — R$267/mês" };
  const limiteLabel = { mensal: "150 leads/dia", trimestral: "300 leads/dia", vitalicio: "600 leads/dia" }[plano] || "—";

  await axios.post("https://api.brevo.com/v3/smtp/email", {
    sender:  { name: "LeadHunter Pro", email: "nilsonleite244@gmail.com" },
    to:      [{ email }],
    subject: "Seu acesso ao LeadHunter Pro está pronto!",
    htmlContent: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;background:#08080f;color:#eeeef2;padding:32px;border-radius:16px">
      <h2 style="color:#f09030;margin-bottom:4px">Bem-vindo ao LeadHunter Pro!</h2>
      <p style="color:#8888a0;margin-bottom:24px">Olá${nome ? " " + nome.split(" ")[0] : ""}! Seu pagamento foi confirmado.</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.2);border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:#8888a0;margin-bottom:4px">Plano ativo</div>
        <div style="font-size:16px;font-weight:700;color:#f09030">${planosLabel[plano] || plano}</div>
        <div style="font-size:12px;color:#8888a0;margin-top:4px">Leads: ${limiteLabel}</div>
      </div>
      <p style="margin-bottom:8px;font-size:14px">Seu token de acesso:</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.3);border-radius:10px;padding:16px;font-family:monospace;font-size:13px;word-break:break-all;color:#f5b455">${token}</div>
      <p style="color:#8888a0;font-size:12px;margin-top:12px">Cole em <b style="color:#eeeef2">Configurações → Token de Acesso</b></p>
      <a href="https://leadhunter-vert.vercel.app" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#f09030,#e06818);color:#000;font-weight:700;padding:12px 24px;border-radius:9px;text-decoration:none">Acessar LeadHunter</a>
    </div>`,
  }, { headers: { "api-key": apiKey } })
    .then(() => console.log(`[Email] Enviado para ${email}`))
    .catch(e => console.error(`[Email] ERRO: ${e.response?.data?.message || e.message}`));
}

// Webhook Kirvano
app.post("/webhook/kirvano", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    let payload;
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString("utf-8"));
    } else if (typeof req.body === "string") {
      payload = JSON.parse(req.body);
    } else {
      payload = req.body; // já parseado pelo middleware global
    }
    const evento  = (payload.event || payload.type || "").toLowerCase();
    const dados   = payload.data || payload;
    const email   = dados.customer?.email || dados.email || dados.buyer?.email;
    const nome    = dados.customer?.name  || dados.name  || dados.buyer?.name || "";
    const txId    = dados.transaction?.id || dados.id    || dados.order_id    || "";

    const ePagamento = ["approved","paid","complete","renewed","reactivated","active"].some(k => evento.includes(k));
    const eCancelado = ["cancel","refund","chargeback","refused"].some(k => evento.includes(k));
    const status = ePagamento ? "ativo" : eCancelado ? "cancelado" : null;

    if (!email || !status) return res.json({ ok: true, msg: "evento ignorado: " + evento });

    if (eCancelado && !ePagamento) {
      await assinantesCol().doc(email.toLowerCase().trim()).update({
        status: "cancelado", expira_em: new Date(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    } else if (ePagamento) {
      const token = await processarPagamento(email, nome, txId, dados, "Kirvano");
      await enviarEmailBoasVindas(email, nome, token, detectarPlano(dados));
    }
    res.json({ ok: true });
  } catch(e) {
    console.error("[Kirvano webhook]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Webhook Cakto
async function handleCaktoWebhook(req, res) {
  try {
    let payload;
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString("utf-8"));
    } else if (typeof req.body === "string") {
      payload = JSON.parse(req.body);
    } else {
      payload = req.body;
    }
    const evento  = (payload.event || payload.type || payload.status || "").toLowerCase();
    const dados   = payload.data || payload.checkout || payload;
    const email   = dados.customer?.email || dados.customer_email || dados.buyer?.email || dados.email;
    const nome    = dados.customer?.name  || dados.customer_name  || dados.buyer?.name  || dados.name || "";
    const txId    = dados.order?.id       || dados.transaction_id || dados.order_id     || payload.id || "";

    const ePagamento = ["approved","paid","complete","renewed","active","created","success"].some(k => evento.includes(k));
    const eCancelado = ["cancel","refund","chargeback","refused"].some(k => evento.includes(k));

    if (!email) return res.json({ ok: true, msg: "sem email no payload" });

    if (eCancelado && !ePagamento) {
      await assinantesCol().doc(email.toLowerCase().trim()).update({
        status: "cancelado", expira_em: new Date(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    } else if (ePagamento) {
      const token = await processarPagamento(email, nome, txId, dados, "Cakto");
      await enviarEmailBoasVindas(email, nome, token, detectarPlano(dados));
    }
    res.json({ ok: true });
  } catch(e) {
    console.error("[Cakto webhook]", e.message);
    res.status(500).json({ error: e.message });
  }
}

const rawBody = express.raw({ type: "*/*" });
app.get("/webhook/cakto", (req, res) => res.json({ ok: true, service: "LeadHunter webhook" }));
app.get("/webhook",       (req, res) => res.json({ ok: true, service: "LeadHunter webhook" }));
app.post("/webhook/cakto", rawBody, handleCaktoWebhook);
app.post("/webhook",       rawBody, handleCaktoWebhook);

// ── AUTH ─────────────────────────────────────────────────────────────────────
app.post("/auth/login", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório" });
    const doc = await assinantesCol().doc(email.toLowerCase().trim()).get();
    if (!doc.exists) return res.status(404).json({ error: "Email não encontrado. Assine o plano para ter acesso." });
    const a = doc.data();
    if (a.status !== "ativo") return res.status(403).json({ error: "Assinatura cancelada ou inativa." });
    if (a.expira_em && a.expira_em.toDate && a.expira_em.toDate() < new Date()) {
      await doc.ref.update({ status: "expirado" }).catch(() => {});
      return res.status(403).json({ error: "Assinatura expirada. Renove para continuar." });
    }
    res.json({ token: a.token, nome: a.nome, ativado_em: a.ativado_em });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/auth/verificar", async (req, res) => {
  const token = req.headers["x-assinante-token"] || req.query.token;
  if (!token) return res.status(401).json({ ok: false });
  try {
    const snap = await assinantesCol().where("token", "==", token).limit(1).get();
    if (snap.empty) return res.status(401).json({ ok: false, motivo: "token inválido" });
    const a = snap.docs[0].data();
    if (a.status !== "ativo") return res.status(401).json({ ok: false, motivo: "assinatura cancelada" });
    if (a.expira_em && a.expira_em.toDate && a.expira_em.toDate() < new Date()) {
      await snap.docs[0].ref.update({ status: "expirado" }).catch(() => {});
      return res.status(401).json({ ok: false, motivo: "assinatura expirada" });
    }
    const hoje = new Date().toISOString().split("T")[0];
    const usadoHoje = a.leads_data === hoje ? (a.leads_hoje || 0) : 0;
    const plano  = a.plano || "mensal";
    const limite = LIMITES_PLANO[plano] ?? 150;
    res.json({
      ok: true, nome: a.nome, email: a.email, plano, expira_em: a.expira_em,
      cota: { limite, usado: usadoHoje, restante: Math.max(0, limite - usadoHoje) }
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN: ASSINANTES ─────────────────────────────────────────────────────────
app.get("/admin/assinantes", async (req, res) => {
  try {
    const snap = await assinantesCol().orderBy("ativado_em", "desc").limit(200).get();
    const assinantes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ total: assinantes.length, assinantes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/assinante/criar", async (req, res) => {
  try {
    const { email, nome, plano = "mensal" } = req.body;
    if (!email) return res.status(400).json({ error: "email obrigatório" });
    const docRef   = assinantesCol().doc(email.toLowerCase().trim());
    const existing = await docRef.get();
    const expiraEm = calcularExpiracao(plano);

    if (existing.exists) {
      await docRef.update({ nome: nome || existing.data().nome, plano, status: "ativo", expira_em: expiraEm, updated_at: admin.firestore.FieldValue.serverTimestamp() });
      return res.json({ ok: true, token: existing.data().token, msg: "Assinante atualizado" });
    }

    const token = gerarToken();
    await docRef.set({
      email: email.toLowerCase().trim(), nome: nome || "", status: "ativo", token, plano,
      ativado_em: admin.firestore.FieldValue.serverTimestamp(), expira_em: expiraEm,
      leads_hoje: 0, leads_data: null, updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ ok: true, token, msg: "Assinante criado" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/admin/assinante/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["ativo","cancelado","expirado"].includes(status)) return res.status(400).json({ error: "status inválido" });
    await assinantesCol().doc(req.params.id).update({ status, updated_at: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/assinante/:id/reset-cota", async (req, res) => {
  try {
    await assinantesCol().doc(req.params.id).update({
      leads_hoje: 0, leads_data: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ ok: true, msg: "Cota diária resetada" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── FRONTEND ──────────────────────────────────────────────────────────────────
app.get("/",        (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/landing", (req, res) => res.sendFile(path.join(__dirname, "landing.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`LeadHunter API rodando na porta ${PORT}`);
  // Inicia Firebase DEPOIS do servidor estar na porta
  // Garante que /health responde mesmo se Firebase demorar ou falhar
  initFirebase();
});
