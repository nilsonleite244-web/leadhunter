"use strict";
const express    = require("express");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const axios      = require("axios");
const admin      = require("firebase-admin");
const path       = require("path");
const { Pool }   = require("pg");
require("dotenv").config();

// ── FIREBASE INIT ─────────────────────────────────────────────────────────────
let credential;
try {
  // Tenta arquivo local primeiro (mais confiável no Railway)
  credential = admin.credential.cert(require("./firebase-service-account.json"));
  console.log("[Firebase] Credencial carregada via arquivo JSON");
} catch {
  try {
    // Fallback: env var
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    console.log("[Firebase] Credencial carregada via env var");
  } catch(e) {
    console.error("[Firebase] Erro ao carregar credencial:", e.message);
    process.exit(1);
  }
}

admin.initializeApp({ credential });
console.log("[Firebase] Inicializado — projeto: leadhunter-eb847");
const db = admin.firestore();

const leadsCol      = () => db.collection("leads_extra");
const assinantesCol = () => db.collection("assinantes");
const campanhasCol  = () => db.collection("campanhas");
const destinatariosCol = () => db.collection("campanha_destinatarios");

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

const LIMITE_MENSAL_DIA = 150;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function paginate(req) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
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
  if (!a || a.plano !== "mensal") return true;

  const hoje = new Date().toISOString().split("T")[0];
  const ultimaData = a.leads_data || null;
  const usadoHoje  = ultimaData === hoje ? (a.leads_hoje || 0) : 0;

  if (usadoHoje >= LIMITE_MENSAL_DIA) {
    res.status(429).json({
      error: `Limite de ${LIMITE_MENSAL_DIA} leads/dia atingido no plano Mensal.`,
      cota: { limite: LIMITE_MENSAL_DIA, usado: usadoHoje, restante: 0 },
      upgrade: "Para acesso ilimitado, faça upgrade para o plano Trimestral ou Vitalício."
    });
    return false;
  }

  const novoTotal = Math.min(usadoHoje + count, LIMITE_MENSAL_DIA);
  assinantesCol().doc(a.id).update({ leads_hoje: novoTotal, leads_data: hoje }).catch(() => {});
  return true;
}

// ── ROTAS PÚBLICAS ────────────────────────────────────────────────────────────
app.get("/version", (req, res) => res.json({ v: "2.1.0", db: "firebase+postgresql" }));

app.get("/health", async (req, res) => {
  try {
    const [snapFb, pgRes] = await Promise.all([
      leadsCol().count().get(),
      pool ? pgQuery("SELECT COUNT(*) FROM leads").catch(() => null) : Promise.resolve(null)
    ]);
    const cnpjCount  = pgRes ? parseInt(pgRes.rows[0].count) : 0;
    const extraCount = snapFb.data().count;
    res.json({ status: "ok", leads_cnpj: cnpjCount, leads_instagram: extraCount, leads_ativos: cnpjCount + extraCount, timestamp: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ status: "erro", error: e.message });
  }
});

// ── LEADS (protegidos) ────────────────────────────────────────────────────────
app.use(["/leads", "/stats", "/campanha", "/whatsapp"], authMiddleware);

// Rotas admin — exigem API_SECRET (somente o dono do sistema)
function adminMiddleware(req, res, next) {
  const secret = process.env.API_SECRET;
  if (!secret) return next(); // sem secret configurado, permite (dev)
  const key = req.headers["x-api-key"] || (req.headers["authorization"] || "").replace("Bearer ", "");
  if (key === secret) return next();
  return res.status(403).json({ error: "Acesso restrito ao administrador" });
}
app.use("/admin", adminMiddleware);

// GET /leads/instagram — busca no Supabase leads_extra (2k+ com Instagram)
app.get("/leads/instagram", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco não configurado" });
    const { page, limit, offset } = paginate(req);
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

    const [countRes, dataRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) FROM leads_extra ${whereStr}`, params),
      pgQuery(`SELECT id, nome, segmento, cidade, estado, instagram, whatsapp, website, funcionarios, receita FROM leads_extra ${whereStr} ORDER BY id LIMIT $${p} OFFSET $${p+1}`, [...params, limit, offset])
    ]);

    const total = parseInt(countRes.rows[0].count);
    const rows = dataRes.rows.map(r => {
      const igRaw = r.instagram || "";
      const handleMatch = igRaw.match(/instagram\.com\/([A-Za-z0-9._]{2,40})/i);
      const handle = handleMatch ? handleMatch[1] : (igRaw.startsWith("@") ? igRaw.slice(1) : (/^[A-Za-z0-9._]{2,40}$/.test(igRaw) ? igRaw : null));
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
        email:         null, cnpj: null, telefone1: null, ddd_municipio: null,
      };
    });

    const ok = await verificarCota(req, res, rows.length);
    if (!ok) return;

    const a = req.assinante;
    const hoje = new Date().toISOString().split("T")[0];
    const usadoHoje = a?.leads_data === hoje ? (a?.leads_hoje || 0) : 0;
    const cota = a?.plano === "mensal" ? {
      limite: LIMITE_MENSAL_DIA, usado: Math.min(usadoHoje + rows.length, LIMITE_MENSAL_DIA),
      restante: Math.max(0, LIMITE_MENSAL_DIA - usadoHoje - rows.length)
    } : null;

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data: rows, cota });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/buscar — busca nos 200k leads de CNPJ (PostgreSQL)
app.get("/leads/buscar", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: "Banco de CNPJ não configurado. Configure DATABASE_URL." });
    const { page, limit, offset } = paginate(req);
    const { uf, segmento: seg, busca, ddd, porte, apenas_com_email, apenas_com_telefone } = req.query;

    const params = [];
    const where  = [];
    let p = 1;

    where.push("situacao_cadastral = 2");

    if (uf)    { where.push(`uf = $${p++}`);                          params.push(uf.toUpperCase()); }
    if (seg)   { where.push(`cnae_descricao ILIKE $${p++}`);          params.push("%" + seg + "%"); }
    if (busca) { where.push(`(razao_social ILIKE $${p} OR nome_fantasia ILIKE $${p+1})`); params.push("%" + busca + "%", "%" + busca + "%"); p += 2; }
    if (ddd)   { where.push(`ddd_municipio = $${p++}`);               params.push(ddd); }
    if (porte) { where.push(`porte = $${p++}`);                       params.push(porte.toUpperCase()); }
    if (req.query.tem_telefone    === "true" || apenas_com_telefone === "true") where.push("telefone1 IS NOT NULL AND telefone1 != ''");
    if (req.query.tem_email === "true" || apenas_com_email === "true") where.push("email IS NOT NULL AND email != ''");

    const whereStr = where.length ? "WHERE " + where.join(" AND ") : "";
    const cols = "cnpj, razao_social, nome_fantasia, cnae_descricao, porte, email, telefone1, ddd_municipio, municipio_nome, uf, nome_socio, score_completude";

    const [countRes, dataRes] = await Promise.all([
      pgQuery(`SELECT COUNT(*) FROM leads ${whereStr}`, params),
      pgQuery(`SELECT ${cols} FROM leads ${whereStr} ORDER BY score_completude DESC LIMIT $${p++} OFFSET $${p++}`, [...params, limit, offset])
    ]);

    const total = parseInt(countRes.rows[0].count);
    const data = dataRes.rows.map(r => ({
      id:            r.cnpj,
      cnpj:          r.cnpj,
      razao_social:  r.razao_social,
      nome_fantasia: r.nome_fantasia,
      cnae_descricao: r.cnae_descricao,
      porte:         r.porte,
      email:         r.email,
      telefone1:     r.telefone1,
      ddd_municipio: r.ddd_municipio,
      municipio_nome: r.municipio_nome,
      uf:            r.uf,
      nome_socio:    r.nome_socio,
    }));

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/aleatorio — 50 CNPJs aleatórios com telefone (PostgreSQL)
app.get("/leads/aleatorio", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    if (pool) {
      const cols = "cnpj, razao_social, nome_fantasia, cnae_descricao, porte, email, telefone1, ddd_municipio, municipio_nome, uf, nome_socio, score_completude";
      const r = await pgQuery(
        `SELECT ${cols} FROM leads WHERE situacao_cadastral=2 AND telefone1 IS NOT NULL AND telefone1 != '' ORDER BY RANDOM() LIMIT $1`,
        [limit]
      );
      const data = r.rows.map(row => ({
        id: row.cnpj, cnpj: row.cnpj, razao_social: row.razao_social,
        nome_fantasia: row.nome_fantasia, cnae_descricao: row.cnae_descricao,
        porte: row.porte, email: row.email, telefone1: row.telefone1,
        ddd_municipio: row.ddd_municipio, municipio_nome: row.municipio_nome,
        uf: row.uf, nome_socio: row.nome_socio,
      }));
      return res.json({ total: data.length, data });
    }
    // Fallback Firebase
    const snap = await leadsCol().limit(limit).get();
    const data = snap.docs.map(doc => docToLead(doc.id, doc.data()));
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
    const fbPromises = [
      leadsCol().count().get(),
      leadsCol().where("has_instagram", "==", true).count().get(),
    ];
    const pgPromises = pool ? [
      pgQuery("SELECT COUNT(*) FROM leads WHERE situacao_cadastral=2"),
      pgQuery("SELECT COUNT(*) FROM leads WHERE situacao_cadastral=2 AND email IS NOT NULL AND email != ''"),
      pgQuery("SELECT COUNT(*) FROM leads WHERE situacao_cadastral=2 AND telefone1 IS NOT NULL AND telefone1 != ''"),
      pgQuery("SELECT porte, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY porte ORDER BY total DESC"),
      pgQuery("SELECT uf, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY uf ORDER BY total DESC LIMIT 10"),
      pgQuery("SELECT COUNT(*) FROM leads_extra WHERE instagram IS NOT NULL AND instagram != ''"),
      pgQuery("SELECT COUNT(*) FROM leads_extra"),
    ] : [];

    const [fbResults, pgResults] = await Promise.all([
      Promise.all(fbPromises),
      Promise.all(pgPromises).catch(() => [])
    ]);

    const cnpjCount  = pgResults[0] ? parseInt(pgResults[0].rows[0].count) : 0;
    const emailCount = pgResults[1] ? parseInt(pgResults[1].rows[0].count) : 0;
    const foneCount  = pgResults[2] ? parseInt(pgResults[2].rows[0].count) : 0;
    const portes     = pgResults[3] ? pgResults[3].rows : [];
    const ufs        = pgResults[4] ? pgResults[4].rows : [];
    const igCount    = pgResults[5] ? parseInt(pgResults[5].rows[0].count) : 0;
    const extraCount = pgResults[6] ? parseInt(pgResults[6].rows[0].count) : 0;

    res.json({
      total_cnpjs:     cnpjCount + extraCount,
      empresas_ativas: cnpjCount,
      leads_instagram: igCount,
      com_email:       emailCount,
      com_telefone:    foneCount,
      leads_com_site:  extraCount,
      por_porte:       portes,
      top_ufs:         ufs
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

// ── CAMPANHAS ────────────────────────────────────────────────────────────────
app.get("/campanha/listar", async (req, res) => {
  try {
    const snap = await campanhasCol().orderBy("created_at", "desc").limit(50).get();
    const campanhas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ campanhas });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/campanha/criar-lista", async (req, res) => {
  try {
    const { nome, canal, cnpjs, mensagem_template, delay_segundos = 60 } = req.body;
    if (!nome || !canal || !cnpjs?.length) return res.status(400).json({ error: "Dados incompletos" });

    const campRef = await campanhasCol().add({
      nome, canal, total: cnpjs.length, enviados: 0, status: "pendente",
      mensagem_template: mensagem_template || null,
      delay_segundos, created_at: admin.firestore.FieldValue.serverTimestamp(),
      iniciado_at: null, concluido_at: null
    });

    // Batch insert destinatários
    const BATCH_SIZE = 400;
    for (let i = 0; i < cnpjs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      cnpjs.slice(i, i + BATCH_SIZE).forEach(cnpj => {
        batch.set(destinatariosCol().doc(), {
          campanha_id: campRef.id, cnpj, status: "pendente", enviado_at: null, erro: null
        });
      });
      await batch.commit();
    }

    res.json({ campanha_id: campRef.id, total: cnpjs.length, status: "pendente" });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/campanha/:id/status", async (req, res) => {
  try {
    const doc = await campanhasCol().doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Campanha não encontrada" });

    const statsSnap = await destinatariosCol()
      .where("campanha_id", "==", req.params.id).get();
    const contagem = {};
    statsSnap.docs.forEach(d => {
      const s = d.data().status;
      contagem[s] = (contagem[s] || 0) + 1;
    });
    const camp = { id: doc.id, ...doc.data() };
    res.json({ ...camp, contagem, progresso_pct: camp.total ? Math.round(((contagem.enviado || 0) / camp.total) * 100) : 0 });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/campanha/:id/status", async (req, res) => {
  try {
    await campanhasCol().doc(req.params.id).update({ status: req.body.status });
    res.json({ ok: true, id: req.params.id, status: req.body.status });
  } catch(e) {
    res.status(500).json({ error: e.message });
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
  if (txt.includes("vitalicio") || txt.includes("vitalício") || txt.includes("lifetime")) return "vitalicio";
  if (txt.includes("trimestral") || txt.includes("quarterly") || txt.includes("3 meses")) return "trimestral";
  return "mensal";
}

function calcularExpiracao(plano) {
  if (plano === "vitalicio") return null;
  const dias = plano === "trimestral" ? 95 : 35;
  return new Date(Date.now() + dias * 86400000);
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
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !token) return;
  const planosLabel = { mensal: "Mensal — R$77", trimestral: "Trimestral — R$190", vitalicio: "Vitalício — R$350" };
  const limiteLabel = plano === "mensal" ? "150 leads/dia" : "Ilimitado";
  await axios.post("https://api.resend.com/emails", {
    from: process.env.EMAIL_FROM || "noreply@leadhunter.app",
    to: email,
    subject: "🦊 Seu acesso ao LeadHunter Pro está pronto!",
    html: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;background:#08080f;color:#eeeef2;padding:32px;border-radius:16px">
      <h2 style="color:#f09030;margin-bottom:4px">Bem-vindo ao LeadHunter Pro! 🦊</h2>
      <p style="color:#8888a0;margin-bottom:24px">Olá${nome ? " " + nome.split(" ")[0] : ""}! Seu pagamento foi confirmado.</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.2);border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:#8888a0;margin-bottom:4px">Plano ativo</div>
        <div style="font-size:16px;font-weight:700;color:#f09030">${planosLabel[plano] || plano}</div>
        <div style="font-size:12px;color:#8888a0;margin-top:4px">Leads: ${limiteLabel}</div>
      </div>
      <p style="margin-bottom:8px;font-size:14px">Seu token de acesso:</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.3);border-radius:10px;padding:16px;font-family:monospace;font-size:13px;word-break:break-all;color:#f5b455">${token}</div>
      <p style="color:#8888a0;font-size:12px;margin-top:12px">Cole em <b style="color:#eeeef2">Configurações → Token de Acesso</b></p>
      <a href="https://leadhunter-vert.vercel.app" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#f09030,#e06818);color:#000;font-weight:700;padding:12px 24px;border-radius:9px;text-decoration:none">Acessar LeadHunter →</a>
    </div>`,
  }, { headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" } })
    .catch(e => console.error("[Resend]", e.message));
}

// Webhook Kirvano
app.post("/webhook/kirvano", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const payload = JSON.parse(typeof req.body === "string" ? req.body : req.body.toString("utf-8"));
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
    const payload = JSON.parse(typeof req.body === "string" ? req.body : req.body.toString("utf-8"));
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
    res.json({
      ok: true, nome: a.nome, email: a.email, plano: a.plano || "mensal", expira_em: a.expira_em,
      cota: a.plano === "mensal" ? { limite: LIMITE_MENSAL_DIA, usado: usadoHoje, restante: Math.max(0, LIMITE_MENSAL_DIA - usadoHoje) } : null
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

// ── ADMIN: APIFY SCRAPING ────────────────────────────────────────────────────

// POST /admin/apify-start — inicia scraping de hashtags no Instagram
app.post("/admin/apify-start", async (req, res) => {
  const key = process.env.APIFY_KEY || req.headers["x-apify-key"] || req.body?.apify_key;
  if (!key) return res.status(400).json({ error: "Configure APIFY_KEY nas variáveis de ambiente." });

  // Aceita hashtags do body ou usa defaults
  const hashtags = Array.isArray(req.body?.hashtags) && req.body.hashtags.length
    ? req.body.hashtags.map(h => h.replace(/^#/, "").trim().toLowerCase()).filter(Boolean)
    : ["barbearia","clinicaestetica","petshop","academia","salaobeleza","restaurante","pizzaria","clinicaodontologica"];

  const resultsLimit = Math.min(parseInt(req.body?.limit) || 200, 1000);

  try {
    const r = await axios.post(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${key}`,
      {
        directUrls: hashtags.map(h => `https://www.instagram.com/explore/tags/${h}/`),
        resultsType: "posts",
        resultsLimit,
        proxy: { useApifyProxy: true },
      }
    );
    const runId = r.data.data.id;
    res.json({ ok: true, runId, hashtags, resultsLimit, status: "RUNNING" });
  } catch(e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// GET /admin/apify-status/:runId — checa status do run
app.get("/admin/apify-status/:runId", async (req, res) => {
  const key = process.env.APIFY_KEY || req.headers["x-apify-key"] || req.query.apify_key;
  if (!key) return res.status(400).json({ error: "APIFY_KEY necessária" });
  try {
    const r = await axios.get(`https://api.apify.com/v2/actor-runs/${req.params.runId}?token=${key}`);
    const d = r.data.data;
    res.json({ status: d.status, stats: d.stats || {}, datasetId: d.defaultDatasetId });
  } catch(e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// POST /admin/apify-import/:runId — importa resultados do run para Supabase
app.post("/admin/apify-import/:runId", async (req, res) => {
  const key = process.env.APIFY_KEY || req.headers["x-apify-key"] || req.body?.apify_key;
  if (!key) return res.status(400).json({ error: "APIFY_KEY necessária" });
  if (!pool) return res.status(503).json({ error: "DATABASE_URL não configurado" });

  try {
    // Verifica status
    const statusRes = await axios.get(`https://api.apify.com/v2/actor-runs/${req.params.runId}?token=${key}`);
    const runData = statusRes.data.data;
    if (runData.status !== "SUCCEEDED")
      return res.json({ ok: false, status: runData.status, msg: `Run ainda em andamento: ${runData.status}` });

    // Busca itens
    const itemsRes = await axios.get(
      `https://api.apify.com/v2/datasets/${runData.defaultDatasetId}/items?token=${key}&limit=5000`
    );
    const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];
    if (!items.length) return res.json({ ok: true, inseridos: 0, ignorados: 0, msg: "Nenhum resultado encontrado" });

    // Carrega handles existentes para checagem de duplicados
    const existingRes = await pgQuery("SELECT instagram FROM leads_extra WHERE instagram IS NOT NULL");
    const existingHandles = new Set(existingRes.rows.map(r => {
      const m = (r.instagram||"").match(/instagram\.com\/([A-Za-z0-9._]+)/i);
      return m ? m[1].toLowerCase() : r.instagram.toLowerCase();
    }));

    const toInsert = [];
    const seen = new Set();
    let ignorados = 0;

    for (const item of items) {
      const handle = item.ownerUsername || item.username;
      if (!handle || seen.has(handle.toLowerCase())) { ignorados++; continue; }
      seen.add(handle.toLowerCase());
      if (existingHandles.has(handle.toLowerCase())) { ignorados++; continue; }

      const nome     = item.ownerFullName || item.fullName || handle;
      const website  = item.externalUrl || null;
      const inputUrl = (item.inputUrl || "").toLowerCase();
      const hashTag  = (inputUrl.match(/tags\/([^/]+)\//)||[])[1] || "";
      const segmento = hashTag || "instagram";
      const instagram = `https://instagram.com/${handle}`;
      const descricao = item.biography || item.caption || null;
      const cidade   = item.locationCity || item.locationName || null;
      const estado   = item.locationState || null;

      toInsert.push([nome, website, segmento, cidade, estado, "Brasil", null, null, instagram, null, descricao]);
    }

    // Insere em batches de 500
    const BATCH = 500;
    let inseridos = 0;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const values = batch.map((_, idx) => {
        const b = idx * 11;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},NOW())`;
      }).join(",");
      await pgQuery(
        `INSERT INTO leads_extra (nome,website,segmento,cidade,estado,pais,funcionarios,receita,instagram,whatsapp,descricao,created_at) VALUES ${values}`,
        batch.flat()
      );
      inseridos += batch.length;
    }

    res.json({ ok: true, total_coletados: items.length, inseridos, ignorados_duplicados: ignorados });
  } catch(e) {
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// ── ADMIN: VERIFICAR TOKEN DE IMPORTAÇÃO ─────────────────────────────────────
// GET /admin/import/verificar — retorna ok:true se o x-api-key === API_SECRET
// Usado pelo frontend da aba "Importar Leads" para desbloquear a área
app.get("/admin/import/verificar", (req, res) => {
  res.json({ ok: true, msg: "Token de importação válido" });
});

// ── FRONTEND ──────────────────────────────────────────────────────────────────
app.get("/",        (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/landing", (req, res) => res.sendFile(path.join(__dirname, "landing.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`LeadHunter API (Firebase) rodando na porta ${PORT}`));
