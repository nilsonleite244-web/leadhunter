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

function leadsExtraCol()   { return db.collection("leads_extra"); }
function leadsGeradosCol() { return db.collection("leads_gerados"); }
function assinantesCol()      { return db.collection("assinantes"); }
function solicitacoesCol()    { return db.collection("solicitacoes_trial"); }

// Normaliza string removendo acentos
function removeAccents(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Mapeia termo de busca/segmento para categoria do Firestore
function segmentoToCategory(seg) {
  const s = removeAccents((seg || "").toLowerCase().trim());
  if (/barbearia|barbeiro/.test(s))                                          return "barbearia";
  if (/odonto|dentist|dental|ortodont/.test(s))                              return "odonto";
  if (/academia|ginast|fitness|recreat|jiujitsu|treinofunc|natacao|corredor|zumba|danca|artes.mar|funcional|musculac|crossfit|boxe|luta|pilates|spinning|ciclismo|triathlon|futebol|escoladefu|muaythai|yoga|personal/.test(s)) return "academia";
  if (/restaurante|lanchonete|hamburguer|pizzaria|sushi|acai|marmita|foodtruck|churrasco|cafeteria|sorveteria|padaria|salgado|doceria|doce|brigadeiro|bolo|confeit|chocolate|gastronom|bistro|bistr/.test(s)) return "restaurante";
  if (/beleza|salao|saloes|cabeleir|manicure|pedicure|sobrancelh|micropigm|lashdesign|unhas|extensao.cilio|cilios|nail|maquiad|maquiagem|esteticist|estetica|depilac|skincare|cosmetico|perfumaria/.test(s)) return "beleza";
  if (/medic|clinica|ambulatory|health|ginecolog|pediatr|cardiol|laborator|maternidade|dermato|ortopedi|fisioter|fonoaudi|terapiaoc|quiroprat|exame|saude|outpatient/.test(s)) return "medic";
  return "outros";
}

// Shuffle determinístico com seed (diário por assinante)
function shuffleWithSeed(arr, seed) {
  const r = [...arr];
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = ((s << 5) - s + seed.charCodeAt(i)) | 0;
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

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
const LIMITES_PLANO  = { mensal: 150, trimestral: 300, vitalicio: 600, trial: 150 };
const PLANOS_LABEL   = { mensal: "Básico", trimestral: "Pro", vitalicio: "Alpha Member" };

// ── DEMO LEADS (50 fixos para contas de afiliado/beta) ───────────────────────
const DEMO_LEADS = [
  { id:"demo_01", nome:"Studio Prado Barber",        segmento:"Barbearia",        handle:"studiopradobarber_",       website:"wa.me/message/E7BSQCGSZZVQK1", cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000101", telefone:"11999990001" },
  { id:"demo_02", nome:"Dra. Elvira Morgado",        segmento:"Clínica Estética", handle:"dra.elviramorgado",         website:"www.skintime.es",              cidade:"Rio de Janeiro", uf:"RJ", ddd:"21", cnpj:"00000000000102", telefone:"21999990002" },
  { id:"demo_03", nome:"Vila Pet",                   segmento:"Pet Shop",         handle:"vilapet_petshop",           website:"wa.me/5561995189438",          cidade:"Brasília",       uf:"DF", ddd:"61", cnpj:"00000000000103", telefone:"61999990003" },
  { id:"demo_04", nome:"JR Guedes João XXIII",       segmento:"Academia",         handle:"academiajrguedes",          website:"bio.site/jrguedes",            cidade:"Fortaleza",      uf:"CE", ddd:"85", cnpj:"00000000000104", telefone:"85999990004" },
  { id:"demo_05", nome:"Barbearia Conceito",         segmento:"Barbearia",        handle:"_barbeariaconceito_",       website:null,                           cidade:"Belo Horizonte", uf:"MG", ddd:"31", cnpj:"00000000000105", telefone:"31999990005" },
  { id:"demo_06", nome:"Filhos de Patas Agropet",    segmento:"Pet Shop",         handle:"filhosdepatasagropet",      website:"linktr.ee/filhosdepatasagropet",cidade:"Salvador",      uf:"BA", ddd:"71", cnpj:"00000000000106", telefone:"71999990006" },
  { id:"demo_07", nome:"Barbearia The Brother's",    segmento:"Barbearia",        handle:"barbeariathebrothers2",     website:"wa.me/5548996424572",          cidade:"Curitiba",       uf:"PR", ddd:"41", cnpj:"00000000000107", telefone:"48999990007" },
  { id:"demo_08", nome:"Marcos Fade",                segmento:"Barbearia",        handle:"marcos.fade",               website:"linktr.ee/marcos.fade",        cidade:"Manaus",         uf:"AM", ddd:"92", cnpj:"00000000000108", telefone:"92999990008" },
  { id:"demo_09", nome:"Barbearia Social",           segmento:"Barbearia",        handle:"barbearia_social",          website:"wa.me/5585987654321",          cidade:"Natal",          uf:"RN", ddd:"84", cnpj:"00000000000109", telefone:"84999990009" },
  { id:"demo_10", nome:"Barber Elite",               segmento:"Barbearia",        handle:"barberelite",               website:"barberelite.com.br",           cidade:"Recife",         uf:"PE", ddd:"81", cnpj:"00000000000110", telefone:"81999990010" },
  { id:"demo_11", nome:"Barbearia Vintage",          segmento:"Barbearia",        handle:"barbearia.vintage",         website:null,                           cidade:"Porto Alegre",   uf:"RS", ddd:"51", cnpj:"00000000000111", telefone:"51999990011" },
  { id:"demo_12", nome:"Barber Shop Pro",            segmento:"Barbearia",        handle:"barbershoppro",             website:"linktr.ee/barbershoppro",      cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000112", telefone:"11999990012" },
  { id:"demo_13", nome:"Studio Barba",               segmento:"Barbearia",        handle:"studiobarba",               website:"studiobarba.belasis.app",      cidade:"Campinas",       uf:"SP", ddd:"19", cnpj:"00000000000113", telefone:"19999990013" },
  { id:"demo_14", nome:"Barbearia Kings",            segmento:"Barbearia",        handle:"barbeariakings",            website:"wa.me/5588999887766",          cidade:"São Luís",       uf:"MA", ddd:"98", cnpj:"00000000000114", telefone:"98999990014" },
  { id:"demo_15", nome:"Mundo Pet",                  segmento:"Pet Shop",         handle:"mundopet",                  website:"mundopet.com.br",              cidade:"Goiânia",        uf:"GO", ddd:"62", cnpj:"00000000000115", telefone:"62999990015" },
  { id:"demo_16", nome:"Pet Care Center",            segmento:"Pet Shop",         handle:"petcarecenter",             website:"linktr.ee/petcarecenter",      cidade:"Belém",          uf:"PA", ddd:"91", cnpj:"00000000000116", telefone:"91999990016" },
  { id:"demo_17", nome:"Pet Max Shop",               segmento:"Pet Shop",         handle:"petmaxshop",                website:"petmaxshop.belasis.app",       cidade:"Santos",         uf:"SP", ddd:"13", cnpj:"00000000000117", telefone:"13999990017" },
  { id:"demo_18", nome:"Loja Pet Premium",           segmento:"Pet Shop",         handle:"lojapetpremium",            website:"lojapetpremium.com.br",        cidade:"Vitória",        uf:"ES", ddd:"27", cnpj:"00000000000118", telefone:"27999990018" },
  { id:"demo_19", nome:"Pet Center Completo",        segmento:"Pet Shop",         handle:"petcentercom",              website:"wa.me/5587888999000",          cidade:"Teresina",       uf:"PI", ddd:"86", cnpj:"00000000000119", telefone:"86999990019" },
  { id:"demo_20", nome:"Academia Fit Life",          segmento:"Academia",         handle:"academiafit_life",          website:"fitlife.belasis.app",          cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000120", telefone:"11999990020" },
  { id:"demo_21", nome:"Academia PowerGym",          segmento:"Academia",         handle:"powergymacademia",          website:"powergymacademia.com.br",      cidade:"Rio de Janeiro", uf:"RJ", ddd:"21", cnpj:"00000000000121", telefone:"21999990021" },
  { id:"demo_22", nome:"Studio Musculação",          segmento:"Academia",         handle:"studiomusc",                website:"linktr.ee/studiomusculacao",   cidade:"Maceió",         uf:"AL", ddd:"82", cnpj:"00000000000122", telefone:"82999990022" },
  { id:"demo_23", nome:"Academia Shape",             segmento:"Academia",         handle:"academiashape",             website:"wa.me/5586777888999",          cidade:"João Pessoa",    uf:"PB", ddd:"83", cnpj:"00000000000123", telefone:"83999990023" },
  { id:"demo_24", nome:"Ginásio Força Total",        segmento:"Academia",         handle:"gimnasiofortotal",          website:"forcatotal.com.br",            cidade:"Aracaju",        uf:"SE", ddd:"79", cnpj:"00000000000124", telefone:"79999990024" },
  { id:"demo_25", nome:"Clínica Beleza Total",       segmento:"Clínica Estética", handle:"clinicabeletatotal",        website:"clinicabeletatotal.com.br",    cidade:"Florianópolis",  uf:"SC", ddd:"48", cnpj:"00000000000125", telefone:"48999990025" },
  { id:"demo_26", nome:"Estética & Wellness",        segmento:"Clínica Estética", handle:"esteticawellness",          website:"esteticawellness.com.br",      cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000126", telefone:"11999990026" },
  { id:"demo_27", nome:"Centro Estético Premium",    segmento:"Clínica Estética", handle:"centroestpremium",          website:"linktr.ee/centroestpremium",   cidade:"Campo Grande",   uf:"MS", ddd:"67", cnpj:"00000000000127", telefone:"67999990027" },
  { id:"demo_28", nome:"Clínica Derma Beauty",       segmento:"Clínica Estética", handle:"clinicadermabe",            website:"dermabeuty.belasis.app",       cidade:"Cuiabá",         uf:"MT", ddd:"65", cnpj:"00000000000128", telefone:"65999990028" },
  { id:"demo_29", nome:"Spa & Estética",             segmento:"Clínica Estética", handle:"spaestetica",               website:"wa.me/5581555444333",          cidade:"Recife",         uf:"PE", ddd:"81", cnpj:"00000000000129", telefone:"81999990029" },
  { id:"demo_30", nome:"Nobres Barbershop Planalto", segmento:"Barbearia",        handle:"nobresbarbershop_planalto", website:"wa.me/5531989224374",          cidade:"Contagem",       uf:"MG", ddd:"31", cnpj:"00000000000130", telefone:"31999990030" },
  { id:"demo_31", nome:"Breno Barber Nobres",        segmento:"Barbearia",        handle:"brenoo_barber",             website:"go.hotmart.com/G104489115V",   cidade:"Porto Alegre",   uf:"RS", ddd:"51", cnpj:"00000000000131", telefone:"51999990031" },
  { id:"demo_32", nome:"Estação Barba",              segmento:"Barbearia",        handle:"estacaobarba",              website:"linktr.ee/estacaobarba",       cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000132", telefone:"11999990032" },
  { id:"demo_33", nome:"Barbearia dos Malandros",    segmento:"Barbearia",        handle:"barbearia_malandros",       website:"wa.me/5584999776655",          cidade:"Mossoró",        uf:"RN", ddd:"84", cnpj:"00000000000133", telefone:"84999990033" },
  { id:"demo_34", nome:"Black Barber Studio",        segmento:"Barbearia",        handle:"blackbarberstudio",         website:"blackbarber.belasis.app",      cidade:"Rio de Janeiro", uf:"RJ", ddd:"21", cnpj:"00000000000134", telefone:"21999990034" },
  { id:"demo_35", nome:"Barbearia Nova Era",         segmento:"Barbearia",        handle:"barbearianovaera",          website:"novaera.com.br",               cidade:"Londrina",       uf:"PR", ddd:"43", cnpj:"00000000000135", telefone:"43999990035" },
  { id:"demo_36", nome:"Corte Perfeito Barber",      segmento:"Barbearia",        handle:"corteperfeito",             website:"linktr.ee/corteperfeito",      cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000136", telefone:"11999990036" },
  { id:"demo_37", nome:"Barbearia Gentil",           segmento:"Barbearia",        handle:"barbeariagentil",           website:"wa.me/5587666555444",          cidade:"Imperatriz",     uf:"MA", ddd:"99", cnpj:"00000000000137", telefone:"99999990037" },
  { id:"demo_38", nome:"Master Cut Barbershop",      segmento:"Barbearia",        handle:"mastercutbarber",           website:"mastercutbarber.com.br",       cidade:"Uberlândia",     uf:"MG", ddd:"34", cnpj:"00000000000138", telefone:"34999990038" },
  { id:"demo_39", nome:"Barbearia Toca do Leão",     segmento:"Barbearia",        handle:"tocadoleao",                website:"linktr.ee/tocadoleao",         cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000139", telefone:"11999990039" },
  { id:"demo_40", nome:"PetWorld Paradise",          segmento:"Pet Shop",         handle:"petworldparadise",          website:"petworldparadise.com.br",      cidade:"Rio de Janeiro", uf:"RJ", ddd:"21", cnpj:"00000000000140", telefone:"21999990040" },
  { id:"demo_41", nome:"Animal Planet Petshop",      segmento:"Pet Shop",         handle:"animalplanetpet",           website:"wa.me/5589888777666",          cidade:"Manaus",         uf:"AM", ddd:"92", cnpj:"00000000000141", telefone:"92999990041" },
  { id:"demo_42", nome:"Royal Pet Shop",             segmento:"Pet Shop",         handle:"royalpetshop",              website:"royalpet.belasis.app",         cidade:"Belém",          uf:"PA", ddd:"91", cnpj:"00000000000142", telefone:"91999990042" },
  { id:"demo_43", nome:"Peludos & Cia",              segmento:"Pet Shop",         handle:"peludosecia",               website:"linktr.ee/peludosecia",        cidade:"Brasília",       uf:"DF", ddd:"61", cnpj:"00000000000143", telefone:"61999990043" },
  { id:"demo_44", nome:"Pet Shop Meu Bichinho",      segmento:"Pet Shop",         handle:"meubichinho",               website:"meubichinho.com.br",           cidade:"Salvador",       uf:"BA", ddd:"71", cnpj:"00000000000144", telefone:"71999990044" },
  { id:"demo_45", nome:"Arco de Animais",            segmento:"Pet Shop",         handle:"arcodeanim_ais",            website:"wa.me/5586555444333",          cidade:"Teresina",       uf:"PI", ddd:"86", cnpj:"00000000000145", telefone:"86999990045" },
  { id:"demo_46", nome:"Power Iron Gym",             segmento:"Academia",         handle:"powerirongym",              website:"powerirungym.com.br",          cidade:"Goiânia",        uf:"GO", ddd:"62", cnpj:"00000000000146", telefone:"62999990046" },
  { id:"demo_47", nome:"Musculação Elite",           segmento:"Academia",         handle:"musculacaoelit",            website:"linktr.ee/musculacaoelit",     cidade:"Belo Horizonte", uf:"MG", ddd:"31", cnpj:"00000000000147", telefone:"31999990047" },
  { id:"demo_48", nome:"Fitness Planet",             segmento:"Academia",         handle:"fitnessplanet",             website:"fitnesplanet.belasis.app",     cidade:"São Paulo",      uf:"SP", ddd:"11", cnpj:"00000000000148", telefone:"11999990048" },
  { id:"demo_49", nome:"Força Bruta Academia",       segmento:"Academia",         handle:"forcabrutaacad",            website:"wa.me/5585444333222",          cidade:"Natal",          uf:"RN", ddd:"84", cnpj:"00000000000149", telefone:"84999990049" },
  { id:"demo_50", nome:"Spartans Gym",               segmento:"Academia",         handle:"spartansgym",               website:"spartansgym.com.br",           cidade:"Curitiba",       uf:"PR", ddd:"41", cnpj:"00000000000150", telefone:"41999990050" },
];

function demoLeadToInstagram(l) {
  return {
    id:             l.id,
    razao_social:   l.nome,
    nome_fantasia:  l.nome,
    cnae_descricao: l.segmento,
    whatsapp_url:   null,
    instagram_url:  `https://instagram.com/${l.handle}`,
    municipio_nome: l.cidade,
    uf:             l.uf,
    website:        l.website,
    funcionarios:   null,
    receita:        null,
    ddd_municipio:  l.ddd,
    email:          null,
    cnpj:           null,
  };
}

function demoLeadToCnpj(l) {
  return {
    id:              l.cnpj,
    cnpj:            l.cnpj,
    razao_social:    l.nome,
    nome_fantasia:   l.nome,
    cnae_descricao:  l.segmento,
    porte:           "ME",
    email:           null,
    telefone1:       l.telefone,
    ddd_municipio:   l.ddd,
    municipio_nome:  l.cidade,
    uf:              l.uf,
    nome_socio:      null,
    score_completude: 60,
  };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function paginate(req) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

// Retorna limite diário do assinante (null = sem limite = admin)
function getLimiteDiario(a) {
  if (!a) return null;
  if (a.is_demo) return 50;
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

// Salva leads entregues no cache diário — Firestore
function salvarLeadsGerados(token, tipo, leads) {
  if (!firebaseOk || !token || !leads?.length) return;
  const hoje = new Date().toISOString().split("T")[0];
  const parentRef = leadsGeradosCol().doc(`${token}_${hoje}`);
  const batch = db.batch();
  for (const l of leads) {
    const rawId = String(l.cnpj || l.id || l.instagram_url || l.whatsapp_url || l.razao_social || Math.random());
    const id = rawId.replace(/[^A-Za-z0-9_\-]/g, "_").slice(0, 100);
    batch.set(parentRef.collection(tipo).doc(id), l);
  }
  batch.commit().catch(() => {});
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
app.get("/version", (req, res) => res.json({ v: "2.3.0", db: "firebase+postgresql", trial_limit: 150 }));

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

// GET /leads/instagram — busca no Firestore leads_extra
app.get("/leads/instagram", async (req, res) => {
  try {
    const a       = req.assinante;

    if (a?.is_demo) {
      const data = DEMO_LEADS.map(demoLeadToInstagram);
      return res.json({ total: 50, page: 1, limit: 50, pages: 1, data, cota: { limite: 50, usado: 50, restante: 0, plano: "demo" } });
    }

    const isAdmin = !a;
    const limite  = getLimiteDiario(a);

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
    const reqLimit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const effectiveLimit = Math.min(reqLimit, restante);
    const offset = (page - 1) * reqLimit;

    const busca    = removeAccents((req.query.busca    || "").trim().toLowerCase());
    const segmento = (req.query.segmento || "").trim();
    const cidade   = removeAccents((req.query.cidade   || "").trim().toLowerCase());
    const apenasIG = req.query.apenas_ig === "true";
    const semIG    = req.query.sem_ig    === "true";

    // Usa um único filtro indexado no Firestore; o restante filtra em memória
    let q = leadsExtraCol();
    if (segmento) {
      q = q.where("category", "==", segmentoToCategory(segmento));
    } else if (semIG) {
      q = q.where("sem_ig", "==", true);
    } else if (apenasIG) {
      q = q.where("has_ig", "==", true);
    }

    const snap = await q.limit(5000).get();
    let docs = snap.docs;

    // Filtros secundários em memória
    if (segmento && apenasIG) docs = docs.filter(d => d.data().has_ig);
    if (segmento && semIG)    docs = docs.filter(d => d.data().sem_ig);
    if (busca)  { docs = docs.filter(d => (d.data().nome_lower  || "").includes(busca)); }
    if (cidade) { docs = docs.filter(d => (d.data().cidade_lower || "").includes(cidade)); }

    const total = isAdmin ? docs.length : null;
    const pages = isAdmin ? Math.ceil(docs.length / effectiveLimit) : null;

    // Embaralha deterministicamente por assinante+dia
    const seed = (a?.token || "admin") + new Date().toISOString().split("T")[0];
    const shuffled = shuffleWithSeed(docs, seed);
    const pageDocs = shuffled.slice(offset, offset + effectiveLimit);
    const rows = pageDocs.map(d => docToLead(d.id, d.data()));

    incrementarCota(a, rows.length);
    if (a) salvarLeadsGerados(a.token, 'instagram', rows);

    const hoje = new Date().toISOString().split("T")[0];
    const usadoAntes = a?.leads_data === hoje ? (a?.leads_hoje || 0) : 0;
    const cota = limite !== null ? {
      limite,
      usado:    Math.min(usadoAntes + rows.length, limite),
      restante: Math.max(0, limite - usadoAntes - rows.length),
      plano:    a.plano,
    } : null;

    res.json({ total, page, limit: effectiveLimit, pages, data: rows, cota });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/buscar — busca nos leads de CNPJ (PostgreSQL)
app.get("/leads/buscar", async (req, res) => {
  try {
    const a = req.assinante;

    if (a?.is_demo) {
      const data = DEMO_LEADS.map(demoLeadToCnpj);
      return res.json({ total: 50, page: 1, limit: 50, pages: 1, data, cota: { limite: 50, usado: 50, restante: 0, plano: "demo" } });
    }

    if (!pool) return res.status(503).json({ error: "Banco de CNPJ não configurado. Configure DATABASE_URL." });

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

    if (uf)    { where.push(`uf = $${p++}`);                                                                                          params.push(uf.toUpperCase()); }
    if (seg)   { where.push(`unaccent(cnae_descricao) ILIKE unaccent($${p++})`);                                                           params.push("%" + seg + "%"); }
    if (busca) { where.push(`(unaccent(razao_social) ILIKE unaccent($${p}) OR unaccent(nome_fantasia) ILIKE unaccent($${p+1}))`); params.push("%" + busca + "%", "%" + busca + "%"); p += 2; }
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
    const a = req.assinante;
    if (!a) return res.status(401).json({ error: "Token inválido" });

    const tipo = req.query.tipo || null;
    const hoje = new Date().toISOString().split("T")[0];
    const parentRef = leadsGeradosCol().doc(`${a.token}_${hoje}`);

    let cnpj = [], instagram = [];
    if (!tipo || tipo === 'cnpj') {
      const snap = await parentRef.collection('cnpj').get();
      cnpj = snap.docs.map(d => d.data());
    }
    if (!tipo || tipo === 'instagram') {
      const snap = await parentRef.collection('instagram').get();
      instagram = snap.docs.map(d => d.data());
    }

    res.json({ total: cnpj.length + instagram.length, cnpj, instagram });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /leads/aleatorio — CNPJs aleatórios com telefone (sujeito à cota do plano)
app.get("/leads/aleatorio", async (req, res) => {
  try {
    const a = req.assinante;

    if (a?.is_demo) {
      const data = DEMO_LEADS.map(demoLeadToCnpj);
      return res.json({ total: 50, data, cota: { limite: 50, usado: 50, restante: 0, plano: "demo" } });
    }

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

async function processarPagamento(email, nome, txId, dados, plataforma, planoOverride = null) {
  const plano    = planoOverride || detectarPlano(dados);
  const expiraEm = calcularExpiracao(plano);
  const docRef   = assinantesCol().doc(email.toLowerCase().trim());
  const existing = await docRef.get();

  if (existing.exists) {
    await docRef.update({
      status: "ativo", plano, expira_em: expiraEm,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[${plataforma}] renovacao: ${email} → ${plano}`);
    return existing.data().token || null;
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

async function enviarEmailResend(email, nome, token, plano) {
  if (!token) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn("[Email Resend] RESEND_API_KEY não configurada"); return; }

  const planosLabel = { mensal: "Básico — R$97/mês", trimestral: "Pro — R$147/mês", vitalicio: "Alpha Member — R$267/mês" };
  const limiteLabel = { mensal: "150 leads/dia", trimestral: "300 leads/dia", vitalicio: "600 leads/dia" }[plano] || "—";
  const primeiroNome = nome ? nome.split(" ")[0] : "";
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  await axios.post("https://api.resend.com/emails", {
    from: `LeadHunter Pro <${from}>`,
    to: [email],
    subject: "Seu acesso ao LeadHunter Pro está pronto!",
    html: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;background:#08080f;color:#eeeef2;padding:32px;border-radius:16px">
      <h2 style="color:#f09030;margin-bottom:4px">Bem-vindo ao LeadHunter Pro!</h2>
      <p style="color:#8888a0;margin-bottom:24px">Olá${primeiroNome ? " " + primeiroNome : ""}! Seu pagamento foi confirmado.</p>
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
  }, { headers: { "Authorization": `Bearer ${apiKey}` } })
    .then(() => console.log(`[Email Resend] Enviado para ${email}`))
    .catch(e => console.error(`[Email Resend] ERRO: ${e.response?.data?.message || e.message}`));
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
    // "refused" é tentativa de pagamento recusada — não cancela o acesso ativo.
    // Só cancela em chargeback/refund/cancel explícito.
    const eCancelado = ["cancel","refund","chargeback"].some(k => evento.includes(k));

    if (!email || (!ePagamento && !eCancelado)) return res.json({ ok: true, msg: "evento ignorado: " + evento });

    if (eCancelado && !ePagamento) {
      await assinantesCol().doc(email.toLowerCase().trim()).update({
        status: "cancelado", expira_em: new Date(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
      console.log(`[Kirvano] cancelamento: ${email} — evento: ${evento}`);
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
    // "refused" é tentativa de pagamento recusada — não cancela o acesso ativo.
    const eCancelado = ["cancel","refund","chargeback"].some(k => evento.includes(k));

    if (!email) return res.json({ ok: true, msg: "sem email no payload" });

    if (eCancelado && !ePagamento) {
      await assinantesCol().doc(email.toLowerCase().trim()).update({
        status: "cancelado", expira_em: new Date(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
      console.log(`[Cakto] cancelamento: ${email} — evento: ${evento}`);
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
app.get("/webhook/cakto",   (req, res) => res.json({ ok: true, service: "LeadHunter webhook" }));
app.get("/webhook/roldpay", (req, res) => res.json({ ok: true, service: "LeadHunter ROLDPAY webhook" }));
app.get("/webhook",         (req, res) => res.json({ ok: true, service: "LeadHunter webhook" }));
app.post("/webhook/cakto", rawBody, handleCaktoWebhook);
app.post("/webhook",       rawBody, handleCaktoWebhook);

// Webhook ROLDPAY
app.post("/webhook/roldpay", rawBody, async (req, res) => {
  try {
    const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : (typeof req.body === "string" ? req.body : JSON.stringify(req.body));

    // Verifica assinatura HMAC-SHA256
    const secret = process.env.ROLDPAY_WEBHOOK_SECRET;
    if (secret) {
      const sig      = req.headers["x-roldpay-signature"] || "";
      const expected = "sha256=" + require("crypto").createHmac("sha256", secret).update(bodyStr).digest("hex");
      if (sig !== expected) {
        console.warn("[ROLDPAY webhook] Assinatura inválida");
        return res.status(401).json({ error: "Assinatura inválida" });
      }
    } else {
      console.warn("[ROLDPAY webhook] ROLDPAY_WEBHOOK_SECRET não configurada — verificação ignorada");
    }

    const payload = JSON.parse(bodyStr);
    const evento  = payload.event || "";
    const data    = payload.data  || {};

    if (evento === "payment.approved") {
      const email       = data.customer?.email;
      const nome        = data.customer?.name  || "";
      const txId        = data.payment?.id     || "";
      const productName = data.product?.name   || "";
      if (!email) return res.json({ ok: true, msg: "sem email no payload" });

      // Mapeamento pelo nome do produto no ROLDPAY
      const n = productName.toLowerCase();
      const plano = n.includes("alpha") ? "vitalicio" : n.includes("pro") ? "trimestral" : "mensal";

      const token = await processarPagamento(email, nome, txId, data, "ROLDPAY", plano);
      await enviarEmailResend(email, nome, token, plano);
      console.log(`[ROLDPAY] processado: ${email} plano=${plano} token=${token ? "novo" : "renovação"}`);
    } else if (["subscription.cancelled", "payment.rejected"].includes(evento)) {
      const email = data.customer?.email;
      if (email) {
        await assinantesCol().doc(email.toLowerCase().trim()).update({
          status: "cancelado", expira_em: new Date(),
          updated_at: admin.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
        console.log(`[ROLDPAY] cancelamento: ${email} — evento: ${evento}`);
      }
    } else {
      console.log(`[ROLDPAY webhook] evento ignorado: ${evento}`);
    }

    res.json({ ok: true });
  } catch(e) {
    console.error("[ROLDPAY webhook]", e.message);
    res.status(500).json({ error: e.message });
  }
});

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
    const limite = a.is_demo ? 50 : (LIMITES_PLANO[plano] ?? 150);
    res.json({
      ok: true, nome: a.nome, email: a.email, plano, expira_em: a.expira_em,
      is_demo: a.is_demo || false,
      cota: { limite, usado: a.is_demo ? 50 : usadoHoje, restante: a.is_demo ? 0 : Math.max(0, limite - usadoHoje) }
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
      await docRef.update({
        nome: nome || existing.data().nome, plano, status: "ativo", expira_em: expiraEm,
        is_trial: admin.firestore.FieldValue.delete(),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
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

// Cria conta demo para afiliados — 50 leads fixos, sem expiração real
app.post("/admin/assinante/criar-demo", async (req, res) => {
  try {
    const { email, nome } = req.body;
    if (!email) return res.status(400).json({ error: "email obrigatório" });
    const docRef   = assinantesCol().doc(email.toLowerCase().trim());
    const existing = await docRef.get();
    const expiraEm = new Date(Date.now() + 3650 * 86400000); // 10 anos

    if (existing.exists) {
      await docRef.update({
        nome: nome || existing.data().nome, plano: "demo", status: "ativo",
        is_demo: true, expira_em: expiraEm,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      return res.json({ ok: true, token: existing.data().token, msg: "Conta demo atualizada — 50 leads fixos para demonstração" });
    }

    const token = gerarToken();
    await docRef.set({
      email: email.toLowerCase().trim(), nome: nome || "", status: "ativo",
      token, plano: "demo", is_demo: true,
      ativado_em: admin.firestore.FieldValue.serverTimestamp(),
      expira_em: expiraEm, leads_hoje: 0, leads_data: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ ok: true, token, msg: "Conta demo criada — 50 leads fixos para demonstração" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── TRIAL GRATUITO (público) ──────────────────────────────────────────────────
app.post("/trial/registrar", requireFirebase, async (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_SECRET)
    return res.status(401).json({ error: "Não autorizado" });
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const nome  = (req.body.nome  || "").trim().slice(0, 80);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Email inválido." });

    const docRef  = assinantesCol().doc(email);
    const snap    = await docRef.get();
    const agora   = new Date();

    // Se já tem conta paga ativa, não sobrescreve
    if (snap.exists) {
      const d = snap.data();
      const pago = ["mensal","trimestral","vitalicio"].includes(d.plano);
      const ativo = d.status === "ativo" && d.expira_em?.toDate?.() > agora;
      if (pago && ativo) { console.log(`[Trial] ${email} já tem plano pago ativo — ignorado`); return res.json({ ok: true }); }
      // Trial já ativo: não recria, só reenvia email
      if (d.plano === "trial" && ativo) {
        await enviarEmailTrial(email, d.nome || nome, d.token);
        return res.json({ ok: true });
      }
    }

    const token    = gerarToken();
    const expiraEm = new Date(Date.now() + 7 * 86400000);
    await docRef.set({
      email, nome, status: "ativo", token, plano: "trial",
      is_trial: true,
      ativado_em: admin.firestore.FieldValue.serverTimestamp(),
      expira_em:  expiraEm,
      leads_hoje: 0, leads_data: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    await enviarEmailTrial(email, nome, token);
    console.log(`[Trial] novo: ${email}`);
    res.json({ ok: true });
  } catch(e) {
    console.error("[Trial] erro:", e.message);
    res.status(500).json({ error: "Erro interno. Tente novamente." });
  }
});

async function enviarEmailTrial(email, nome, token) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn("[Trial] RESEND_API_KEY não configurada"); return; }
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const primeiroNome = nome ? nome.split(" ")[0] : "";
  await axios.post("https://api.resend.com/emails", {
    from: `Hunter Leads <${from}>`,
    to: [email],
    subject: "Seu acesso gratuito ao Hunter Leads está pronto!",
    html: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;background:#08080f;color:#eeeef2;padding:32px;border-radius:16px">
      <h2 style="color:#f09030;margin-bottom:4px">🦊 Seu trial de 7 dias começou!</h2>
      <p style="color:#8888a0;margin-bottom:24px">Olá${primeiroNome ? " " + primeiroNome : ""}! Bem-vindo ao Hunter Leads. Você tem <strong style="color:#f09030">150 leads por dia</strong> durante 7 dias, sem precisar de cartão.</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.2);border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:#8888a0;margin-bottom:4px">Seu plano gratuito</div>
        <div style="font-size:16px;font-weight:700;color:#f09030">Trial — 7 dias grátis</div>
        <div style="font-size:12px;color:#8888a0;margin-top:4px">150 leads/dia · Expira em 7 dias</div>
      </div>
      <p style="margin-bottom:8px;font-size:14px">Seu token de acesso:</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.3);border-radius:10px;padding:16px;font-family:monospace;font-size:13px;word-break:break-all;color:#f5b455">${token}</div>
      <p style="color:#8888a0;font-size:12px;margin-top:12px">Cole em <b style="color:#eeeef2">Configurações → Token de Acesso</b></p>
      <a href="https://leadhunter-vert.vercel.app" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#f09030,#e06818);color:#000;font-weight:700;padding:12px 24px;border-radius:9px;text-decoration:none">Acessar Hunter Leads →</a>
      <p style="color:#555568;font-size:11px;margin-top:24px">Após o trial, assine por R$97/mês para continuar com 150 leads/dia.</p>
    </div>`,
  }, { headers: { "Authorization": `Bearer ${apiKey}` } })
    .then(() => console.log(`[Trial] email enviado: ${email}`))
    .catch(e => console.error(`[Trial] email erro: ${e.response?.data?.message || e.message}`));
}

// ── SOLICITAÇÕES DE TRIAL (público) ──────────────────────────────────────────
app.post("/trial/solicitar", requireFirebase, async (req, res) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const nome  = (req.body.nome  || "").trim().slice(0, 80);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Email inválido." });

    const agora = new Date();

    const assnSnap = await assinantesCol().doc(email).get();
    if (assnSnap.exists) {
      const d = assnSnap.data();
      const ativo = d.status === "ativo" && (!d.expira_em || d.expira_em?.toDate?.() > agora);
      if (ativo) return res.json({ ok: true }); // já tem acesso
    }

    const solSnap = await solicitacoesCol().doc(email).get();
    if (solSnap.exists && solSnap.data().status === "pendente")
      return res.json({ ok: true }); // solicitação já existe

    await solicitacoesCol().doc(email).set({
      email, nome, status: "pendente",
      criado_em: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[Solicitação] nova: ${email}`);
    res.json({ ok: true });
  } catch(e) {
    console.error("[Solicitação] erro:", e.message);
    res.status(500).json({ error: "Erro interno. Tente novamente." });
  }
});

app.get("/admin/solicitacoes", async (req, res) => {
  try {
    const status = req.query.status || "pendente";
    const snap = await solicitacoesCol().where("status", "==", status).limit(100).get();
    const solicitacoes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.criado_em?._seconds || 0) - (a.criado_em?._seconds || 0));
    res.json({ total: solicitacoes.length, solicitacoes });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/solicitacoes/:email/aprovar", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const solRef = solicitacoesCol().doc(email);
    const sol = await solRef.get();
    if (!sol.exists) return res.status(404).json({ error: "Solicitação não encontrada" });

    const nome = sol.data().nome || "";
    const agora = new Date();
    const docRef = assinantesCol().doc(email);
    const existing = await docRef.get();

    if (existing.exists) {
      const d = existing.data();
      const ativo = d.status === "ativo" && d.expira_em?.toDate?.() > agora;
      if (["mensal","trimestral","vitalicio"].includes(d.plano) && ativo) {
        await solRef.update({ status: "aprovado", updated_at: admin.firestore.FieldValue.serverTimestamp() });
        return res.json({ ok: true, msg: "Usuário já tem plano pago ativo" });
      }
      if (d.plano === "trial" && ativo) {
        await enviarEmailTrial(email, d.nome || nome, d.token);
        await solRef.update({ status: "aprovado", updated_at: admin.firestore.FieldValue.serverTimestamp() });
        return res.json({ ok: true, msg: "Email de trial reenviado" });
      }
    }

    const token    = gerarToken();
    const expiraEm = new Date(Date.now() + 7 * 86400000);
    await docRef.set({
      email, nome, status: "ativo", token, plano: "trial", is_trial: true,
      ativado_em: admin.firestore.FieldValue.serverTimestamp(),
      expira_em:  expiraEm, leads_hoje: 0, leads_data: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    await enviarEmailTrial(email, nome, token);
    await solRef.update({ status: "aprovado", updated_at: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`[Solicitação] aprovada: ${email}`);
    res.json({ ok: true, msg: "Trial ativado e email enviado" });
  } catch(e) {
    console.error("[Solicitação aprovar] erro:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/admin/solicitacoes/:email/rejeitar", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();
    const solRef = solicitacoesCol().doc(email);
    if (!(await solRef.get()).exists) return res.status(404).json({ error: "Solicitação não encontrada" });
    await solRef.update({ status: "rejeitado", updated_at: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ ok: true });
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

// Reativa assinante expirado/cancelado por mais 35 dias
app.post("/admin/assinante/:id/reativar", async (req, res) => {
  try {
    const { plano } = req.body;
    const expiraEm = calcularExpiracao(plano || "mensal");
    const docRef = assinantesCol().doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Assinante não encontrado" });
    await docRef.update({
      status: "ativo",
      plano: plano || doc.data().plano || "mensal",
      expira_em: expiraEm,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ ok: true, msg: "Assinante reativado", expira_em: expiraEm });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Lista assinantes com problemas (expirados ou cancelados)
app.get("/admin/assinantes/problemas", async (req, res) => {
  try {
    const snap = await assinantesCol().where("status", "!=", "ativo").limit(200).get();
    const agora = new Date();
    // Também pega os ativos com expira_em já passada
    const snapAtivos = await assinantesCol().where("status", "==", "ativo").limit(200).get();
    const expiradosSemUpdate = snapAtivos.docs.filter(d => {
      const exp = d.data().expira_em;
      return exp && exp.toDate && exp.toDate() < agora;
    });
    const todos = [
      ...snap.docs.map(d => ({ id: d.id, ...d.data(), _problema: d.data().status })),
      ...expiradosSemUpdate.map(d => ({ id: d.id, ...d.data(), _problema: "ativo_expirado" })),
    ];
    res.json({ total: todos.length, assinantes: todos });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ── FRONTEND ──────────────────────────────────────────────────────────────────
app.get("/",          (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/landing",   (req, res) => res.sendFile(path.join(__dirname, "landing.html")));
app.get("/solicitar", (req, res) => res.sendFile(path.join(__dirname, "solicitar.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`LeadHunter API rodando na porta ${PORT}`);
  // Inicia Firebase DEPOIS do servidor estar na porta
  // Garante que /health responde mesmo se Firebase demorar ou falhar
  initFirebase();
});
