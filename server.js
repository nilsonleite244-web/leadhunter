"use strict";
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
require("dotenv").config();
const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 5,
  family: 4,
});
pool.on("error", (err) => { console.error("Erro no pool:", err.message); });
process.on("uncaughtException",  (err) => { console.error("[uncaughtException]",  err.message); });
process.on("unhandledRejection", (err) => { console.error("[unhandledRejection]", err); });
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 60000, max: 300, message: { error: "Muitas requisicoes" } }));
const path = require("path");
const query = (sql, params) => pool.query(sql, params);

// ── AUTENTICACAO ──
// Se API_SECRET estiver definido no .env, todas as rotas (exceto /health) exigem
// o header  x-api-key: <segredo>  ou  Authorization: Bearer <segredo>
// ── PLANOS ───────────────────────────────────────────────────────────────────
const LIMITE_MENSAL_DIA = 150; // leads/dia no plano mensal

function authMiddleware(req, res, next) {
  const secret = process.env.API_SECRET;
  if (!secret) return next();

  const key = req.headers["x-api-key"] || (req.headers["authorization"] || "").replace("Bearer ", "");
  if (key === secret) return next();

  const token = req.headers["x-assinante-token"];
  if (token) {
    pool.query(
      `SELECT id, plano, leads_hoje, leads_data
       FROM assinantes
       WHERE token=$1 AND status='ativo' AND (expira_em IS NULL OR expira_em > NOW())`,
      [token]
    ).then(r => {
      if (!r.rows.length) return res.status(401).json({ error: "Assinatura inativa ou expirada" });
      req.assinante = r.rows[0]; // disponível para os endpoints
      next();
    }).catch(() => res.status(500).json({ error: "Erro ao verificar assinatura" }));
    return;
  }

  res.status(401).json({ error: "Nao autorizado — faça login no LeadHunter" });
}

// Verifica e atualiza cota diária do plano mensal; retorna false se esgotada
async function verificarCota(req, res, count) {
  const a = req.assinante;
  if (!a || a.plano !== 'mensal') return true; // planos superiores: ilimitado

  const hoje = new Date().toISOString().split('T')[0];
  const ultimaData = a.leads_data ? new Date(a.leads_data).toISOString().split('T')[0] : null;
  const usadoHoje  = ultimaData === hoje ? (a.leads_hoje || 0) : 0;

  if (usadoHoje >= LIMITE_MENSAL_DIA) {
    res.status(429).json({
      error: `Limite de ${LIMITE_MENSAL_DIA} leads/dia atingido no plano Mensal.`,
      cota: { limite: LIMITE_MENSAL_DIA, usado: usadoHoje, restante: 0 },
      upgrade: 'Para acesso ilimitado, faça upgrade para o plano Trimestral ou Vitalício.'
    });
    return false;
  }

  const novoTotal = Math.min(usadoHoje + count, LIMITE_MENSAL_DIA);
  await pool.query(
    "UPDATE assinantes SET leads_hoje=$2, leads_data=CURRENT_DATE WHERE id=$1",
    [a.id, novoTotal]
  ).catch(() => {});
  return true;
}

function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}


app.get("/seed/instagram-leads-DISABLED", async (req, res) => {
  const LEADS = [
    {s:"barbearia",n:"Studio Prado Barber",h:"studiopradobarber_",w:"wa.me/message/E7BSQCGSZZVQK1"},
    {s:"clinicaestetica",n:"Dra. Elvira Morgado",h:"dra.elviramorgado",w:"www.skintime.es"},
    {s:"petshop",n:"Vila Pet",h:"vilapet_petshop",w:"wa.me/5561995189438"},
    {s:"academia",n:"JR Guedes João XXIII",h:"academiajrguedes",w:"bio.site/jrguedes"},
    {s:"barbearia",n:"Barbearia Conceito",h:"_barbeariaconceito_",w:"sites.appbarber.com.br/links/Barbeariconceito"},
    {s:"petshop",n:"Filhos de Patas Agropet",h:"filhosdepatasagropet",w:"linktr.ee/filhosdepatasagropet"},
    {s:"barbearia",n:"Barbearia The Brother's",h:"barbeariathebrothers2",w:"wa.me/5548996424572"},
    {s:"barbearia",n:"Marcos Fade",h:"marcos.fade",w:"linktr.ee/marcos.fade"},
    {s:"barbearia",n:"Barbearia Social",h:"barbearia_social",w:"wa.me/5585987654321"},
    {s:"barbearia",n:"Barber Elite",h:"barberelite",w:"barberelite.com.br"},
    {s:"barbearia",n:"Barbearia Vintage",h:"barbearia.vintage",w:null},
    {s:"barbearia",n:"Barber Shop Pro",h:"barbershoppro",w:"linktr.ee/barbershoppro"},
    {s:"barbearia",n:"Studio Barba",h:"studiobarba",w:"studiobarba.belasis.app"},
    {s:"barbearia",n:"Barbearia Kings",h:"barbeariakings",w:"wa.me/5588999887766"},
    {s:"petshop",n:"Mundo Pet",h:"mundopet",w:"mundopet.com.br"},
    {s:"petshop",n:"Pet Care Center",h:"petcarecenter",w:"linktr.ee/petcarecenter"},
    {s:"petshop",n:"Pet Max Shop",h:"petmaxshop",w:"petmaxshop.belasis.app"},
    {s:"petshop",n:"Loja Pet Premium",h:"lojapetpremium",w:"lojapetpremium.com.br"},
    {s:"petshop",n:"Pet Center Completo",h:"petcentercom",w:"wa.me/5587888999000"},
    {s:"academia",n:"Academia Fit Life",h:"academiafit_life",w:"fitlife.belasis.app"},
    {s:"academia",n:"Academia PowerGym",h:"powergymacademia",w:"powergymacademia.com.br"},
    {s:"academia",n:"Studio Musculação",h:"studiomusc",w:"linktr.ee/studiomusculacao"},
    {s:"academia",n:"Academia Shape",h:"academiashape",w:"wa.me/5586777888999"},
    {s:"academia",n:"Ginásio Força Total",h:"gimnasiofortotal",w:"forcatotal.com.br"},
    {s:"clinicaestetica",n:"Clínica Beleza Total",h:"clinicabeletatotal",w:"clinicabeletatotal.com.br"},
    {s:"clinicaestetica",n:"Estética & Wellness",h:"esteticawellness",w:"esteticawellness.com.br"},
    {s:"clinicaestetica",n:"Centro Estético Premium",h:"centroestpremium",w:"linktr.ee/centroestpremium"},
    {s:"clinicaestetica",n:"Clínica Derma Beauty",h:"clinicadermabe",w:"dermabeuty.belasis.app"},
    {s:"clinicaestetica",n:"Spa & Estética",h:"spaestetica",w:"wa.me/5581555444333"},
    {s:"barbearia",n:"Nobres Barbershop Planalto",h:"nobresbarbershop_planalto",w:"wa.me/5531989224374"},
    {s:"barbearia",n:"Breno Barber Nobres",h:"brenoo_barber",w:"go.hotmart.com/G104489115V"},
    {s:"barbearia",n:"Estação Barba",h:"estacaobarba",w:"linktr.ee/estacaobarba"},
    {s:"barbearia",n:"Barbearia dos Malandros",h:"barbearia_malandros",w:"wa.me/5584999776655"},
    {s:"barbearia",n:"Black Barber Studio",h:"blackbarberstudio",w:"blackbarber.belasis.app"},
    {s:"barbearia",n:"Barbearia Nova Era",h:"barbearianovaera",w:"novaera.com.br"},
    {s:"barbearia",n:"Corte Perfeito Barber",h:"corteperfeito",w:"linktr.ee/corteperfeito"},
    {s:"barbearia",n:"Barbearia Gentil",h:"barbeariagentil",w:"wa.me/5587666555444"},
    {s:"barbearia",n:"Master Cut Barbershop",h:"mastercutbarber",w:"mastercutbarber.com.br"},
    {s:"barbearia",n:"Barbearia Toca do Leão",h:"tocadoleao",w:"linktr.ee/tocadoleao"},
    {s:"petshop",n:"PetWorld Paradise",h:"petworldparadise",w:"petworldparadise.com.br"},
    {s:"petshop",n:"Animal Planet Petshop",h:"animalplanetpet",w:"wa.me/5589888777666"},
    {s:"petshop",n:"Royal Pet Shop",h:"royalpetshop",w:"royalpet.belasis.app"},
    {s:"petshop",n:"Peludos & Cia",h:"peludosecia",w:"linktr.ee/peludosecia"},
    {s:"petshop",n:"Pet Shop Meu Bichinho",h:"meubichinho",w:"meubichinho.com.br"},
    {s:"petshop",n:"Arco de Animais",h:"arcodeanim_ais",w:"wa.me/5586555444333"},
    {s:"academia",n:"Power Iron Gym",h:"powerirongym",w:"powerirungym.com.br"},
    {s:"academia",n:"Musculação Elite",h:"musculacaoelit",w:"linktr.ee/musculacaoelit"},
    {s:"academia",n:"Fitness Planet",h:"fitnessplanet",w:"fitnesplanet.belasis.app"},
    {s:"academia",n:"Força Bruta Academia",h:"forcabrutaacad",w:"wa.me/5585444333222"},
    {s:"academia",n:"Spartans Gym",h:"spartansgym",w:"spartansgym.com.br"},
    {s:"academia",n:"Iron Paradise",h:"ironparadise",w:"ironparadise.com.br"},
    {s:"clinicaestetica",n:"Clínica Transformação",h:"clinicatransf",w:"clinicatransformacao.com.br"},
    {s:"clinicaestetica",n:"Beleza Única Estética",h:"belezaunica",w:"linktr.ee/belezaunica"},
    {s:"clinicaestetica",n:"Glow Aesthetic Clinic",h:"glowesthetic",w:"glowclinic.belasis.app"},
    {s:"clinicaestetica",n:"Rejuvenescimento Total",h:"rejuvenescimento",w:"wa.me/5583333222111"},
    {s:"clinicaestetica",n:"Estética Moderna",h:"esteticamoderna",w:"esteticamoderna.com.br"},
    {s:"barbearia",n:"Barbearia Aristocrata",h:"barbeariaristaocrata",w:"linktr.ee/aristocrata"},
    {s:"barbearia",n:"Barber Angels",h:"barberangels",w:"baberanger.com.br"},
    {s:"barbearia",n:"Barbearia Luxury",h:"barbearia_luxury",w:"wa.me/5582222111000"},
    {s:"barbearia",n:"Corte Fino Barber",h:"cortefino",w:"cortefino.belasis.app"},
    {s:"barbearia",n:"Barbearia Original",h:"barbeariaoriginal",w:"barbeariaoriginal.com.br"},
    {s:"barbearia",n:"Studio Lâmina",h:"studia_lamina",w:"linktr.ee/studiolâmina"},
    {s:"petshop",n:"Pet's House",h:"petshouse",w:"petshouse.com.br"},
    {s:"petshop",n:"Zoológico Doméstico",h:"zoologicodom",w:"wa.me/5581111000999"},
    {s:"petshop",n:"PetLand Express",h:"petlandexpress",w:"petlandexpress.belasis.app"},
    {s:"petshop",n:"Planeta Animal",h:"planetaanimal",w:"planetaanimal.com.br"},
    {s:"academia",n:"Titan Strength",h:"titanstrenght",w:"titanstrenght.com.br"},
    {s:"academia",n:"Valhala Gym",h:"valhalagym",w:"valhalagym.belasis.app"},
    {s:"academia",n:"Ultimate Fitness",h:"ultimatefitness",w:"wa.me/5580999888777"},
    {s:"academia",n:"Força Total",h:"forcatotalacad",w:"forcatotal.com.br"},
    {s:"clinicaestetica",n:"Renascimento Estético",h:"renascimentoest",w:"renascimento.com.br"},
    {s:"clinicaestetica",n:"Harmonia Beauty",h:"harmoniabeauty",w:"harmoniabeauty.belasis.app"},
    {s:"clinicaestetica",n:"Cirurgia Plástica Pro",h:"cirurgiaplasticapro",w:"cirurgiapro.com.br"},
    {s:"clinicaestetica",n:"Radiance Clinic",h:"radianceclinic",w:"wa.me/5579888777666"},
    {s:"barbearia",n:"Barbearia Retrô",h:"barbeariaretr",w:"linktr.ee/barbeariaretr"},
    {s:"barbearia",n:"Cutting Edge",h:"cuttingedge",w:"cuttingedge.com.br"},
    {s:"petshop",n:"Arca de Noé Pets",h:"arcadenoepets",w:"arcadenoepets.com.br"},
    {s:"academia",n:"Phoenix Fitness",h:"phoenixfitness",w:"phoenixfitness.belasis.app"},
  ];
  try {
    let inseridos = 0, atualizados = 0;
    for (const l of LEADS) {
      const ig = "@" + l.h;
      const ex = await pool.query("SELECT id FROM leads_extra WHERE instagram ILIKE $1 LIMIT 1", ["%" + l.h + "%"]);
      if (ex.rows.length) {
        await pool.query("UPDATE leads_extra SET nome=COALESCE(NULLIF(nome,''),$2),website=COALESCE(NULLIF(website,''),$3),segmento=COALESCE(NULLIF(segmento,''),$4) WHERE id=$1",
          [ex.rows[0].id, l.n, l.w, l.s]);
        atualizados++;
      } else {
        await pool.query("INSERT INTO leads_extra(nome,instagram,website,segmento,pais,created_at) VALUES($1,$2,$3,$4,'Brasil',NOW())",
          [l.n, ig, l.w||null, l.s]);
        inseridos++;
      }
    }
    res.json({ ok: true, inseridos, atualizados, total: LEADS.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get("/health", async (req, res) => {
  try {
    const r1 = await pool.query("SELECT COUNT(*) as count FROM leads");
    const r2 = await pool.query("SELECT COUNT(*) as count FROM leads_extra").catch(() => ({ rows: [{ count: '0' }] }));
    const count2 = parseInt(r2.rows[0].count) || 0;
    const total = parseInt(r1.rows[0].count) + count2;
    res.json({ status: "ok", leads_ativos: total, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: "erro", error: e.message });
  }
});
app.use(["/leads", "/stats", "/campanha", "/whatsapp", "/admin"], authMiddleware);

// leads_extra schema: id, nome, website, descricao, funcionarios, receita,
//   pais, estado, cidade, segmento, instagram (descrição que menciona IG), whatsapp, created_at
app.get("/leads/instagram", async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const busca    = req.query.busca    ? req.query.busca.trim()    : null;
    const segmento = req.query.segmento ? req.query.segmento.trim() : null;
    const cidade   = req.query.cidade   ? req.query.cidade.trim()   : null;

    // Extrai o handle do Instagram da coluna de descrição
    // Ex: "...instagram.com/minha_loja..." → "https://instagram.com/minha_loja"
    const igExtract = `
      CASE
        WHEN instagram ~* 'instagram\\.com/([A-Za-z0-9._]{2,40})'
        THEN 'https://instagram.com/' ||
             (regexp_match(instagram, '(?i)instagram\\.com/([A-Za-z0-9._]{2,40})'))[1]
        WHEN instagram ~* '@([A-Za-z0-9._]{2,40})'
        THEN 'https://instagram.com/' ||
             (regexp_match(instagram, '@([A-Za-z0-9._]{2,40})'))[1]
        ELSE NULL
      END
    `;

    const select = `
      id,
      nome          AS razao_social,
      nome          AS nome_fantasia,
      segmento      AS cnae_descricao,
      whatsapp      AS whatsapp_url,
      (${igExtract}) AS instagram_url,
      cidade        AS municipio_nome,
      estado        AS uf,
      website,
      funcionarios,
      receita,
      NULL::text    AS ddd_municipio,
      NULL::text    AS email,
      NULL::text    AS cnpj
    `;

    const apenasAtivos = req.query.apenas_ativos === 'true';

    // Só retorna leads onde conseguimos extrair um handle de Instagram
    const conditions = [
      `(instagram ~* 'instagram\\.com/[A-Za-z0-9._]{2,}' OR instagram ~* '@[A-Za-z0-9._]{2,}')`
    ];

    // "Apenas ativos": tem site próprio (não uma rede social como "site") = empresa estabelecida
    if (apenasAtivos) {
      conditions.push("website IS NOT NULL AND website != ''");
      conditions.push("website NOT ILIKE '%instagram.com%'");
      conditions.push("website NOT ILIKE '%wa.me%'");
      conditions.push("website NOT ILIKE '%facebook.com%'");
      conditions.push("website NOT ILIKE '%linktr.ee%'");
      conditions.push("website NOT ILIKE '%tiktok.com%'");
      conditions.push("website NOT ILIKE '%youtube.com%'");
    }

    const params = [];
    let p = 1;

    if (busca) {
      conditions.push(`(nome ILIKE $${p} OR segmento ILIKE $${p})`);
      params.push('%' + busca + '%'); p++;
    }
    if (segmento) {
      conditions.push(`segmento ILIKE $${p++}`);
      params.push('%' + segmento + '%');
    }
    if (cidade) {
      conditions.push(`cidade ILIKE $${p++}`);
      params.push('%' + cidade + '%');
    }

    const where = "WHERE " + conditions.join(" AND ");
    const countRes = await pool.query(`SELECT COUNT(*) FROM leads_extra ${where}`, params);
    const total = parseInt(countRes.rows[0].count) || 0;

    const dataRes = await pool.query(
      `SELECT ${select} FROM leads_extra ${where} ORDER BY id DESC LIMIT $${p++} OFFSET $${p++}`,
      [...params, limit, offset]
    );

    const rows = dataRes.rows;
    const ok = await verificarCota(req, res, rows.length);
    if (!ok) return;

    const a = req.assinante;
    const cota = a?.plano === 'mensal' ? {
      limite: LIMITE_MENSAL_DIA,
      usado: Math.min((a.leads_hoje||0) + rows.length, LIMITE_MENSAL_DIA),
      restante: Math.max(0, LIMITE_MENSAL_DIA - (a.leads_hoje||0) - rows.length)
    } : null;

    res.json({ total, page, limit, pages: Math.ceil(total / limit), data: rows, cota });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/leads/aleatorio", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const cols = "cnpj, razao_social, nome_fantasia, cnae_descricao, porte, email, telefone1, ddd_municipio, municipio_nome, uf, nome_socio, score_completude";
    const result = await query(
      `SELECT ${cols} FROM leads TABLESAMPLE SYSTEM(1)
       WHERE situacao_cadastral = 2 AND telefone1 IS NOT NULL AND telefone1 != ''
       LIMIT $1`,
      [limit]
    );
    res.json({ total: result.rows.length, data: result.rows, aviso: "Leads da base CNPJ — contato recomendado por ligação." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/leads/buscar", async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const { ddd, uf, cnae, porte, tem_email, tem_telefone, simples, mei, abertura_de, abertura_ate, score_min, busca } = req.query;
    const conditions = ["situacao_cadastral = 2"];
    const params = [];
    let p = 1;
    if (ddd) { conditions.push("ddd_municipio = ANY($" + p++ + ")"); params.push(ddd.split(",").map(d => d.trim())); }
    if (uf) { conditions.push("uf = $" + p++); params.push(uf.toUpperCase()); }
    if (cnae) { conditions.push("cnae_principal = ANY($" + p++ + ")"); params.push(cnae.split(",").map(c => c.trim())); }
    if (porte) { conditions.push("porte = $" + p++); params.push(porte.toUpperCase()); }
    if (tem_email === "true") conditions.push("email IS NOT NULL AND email != ''");
    if (tem_telefone === "true") conditions.push("telefone1 IS NOT NULL AND telefone1 != ''");
    if (simples === "true") conditions.push("optante_simples = TRUE");
    if (mei === "true") conditions.push("optante_mei = TRUE");
    if (abertura_de) { conditions.push("data_abertura >= $" + p++); params.push(abertura_de); }
    if (abertura_ate) { conditions.push("data_abertura <= $" + p++); params.push(abertura_ate); }
    if (score_min) { conditions.push("score_completude >= $" + p++); params.push(parseInt(score_min)); }
    if (busca && busca.trim()) { conditions.push("(razao_social ILIKE $" + p + " OR nome_fantasia ILIKE $" + p + ")"); params.push("%" + busca.trim() + "%"); p++; }
    const where = "WHERE " + conditions.join(" AND ");
    const cols = "cnpj, razao_social, nome_fantasia, cnae_principal, cnae_descricao, porte, email, telefone1, telefone2, ddd_municipio, municipio_nome, uf, logradouro, numero, bairro, cep, data_abertura, optante_simples, optante_mei, nome_socio, score_completude";
    const countRes = await query("SELECT COUNT(*) FROM leads " + where, params);
    const total = parseInt(countRes.rows[0].count);
    const dataRes = await query("SELECT " + cols + " FROM leads " + where + " ORDER BY score_completude DESC LIMIT $" + p++ + " OFFSET $" + p++, [...params, limit, offset]);
    let extraRows = [];
    try {
      const extraRes = await pool.query("SELECT nome as razao_social, nome as nome_fantasia, segmento as cnae_descricao, telefone as telefone1, whatsapp_url, instagram_url, endereco as logradouro, status FROM leads_extra LIMIT $1", [limit]);
      extraRows = extraRes.rows;
    } catch(e) {}
    const allLeads = [...dataRes.rows, ...extraRows].slice(0, limit);
    res.json({ total: total + extraRows.length, page, limit, pages: Math.ceil(total / limit), data: allLeads, aviso: "Leads da base CNPJ — contato recomendado por ligação." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/leads/:cnpj", async (req, res) => {
  try {
    const cnpj = req.params.cnpj.replace(/\D/g, "").padStart(14, "0");
    let local = await query("SELECT * FROM leads WHERE cnpj = $1", [cnpj]);
    if (!local.rows.length) {
      try { local = await pool.query("SELECT * FROM leads_extra WHERE cnpj = $1", [cnpj]); } catch(e) {}
    }
    if (!local.rows.length) return res.status(404).json({ error: "CNPJ nao encontrado" });
    res.json(local.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/stats/geral", async (req, res) => {
  try {
    const [total, ativos, comEmail, comTel, porPorte, porUF, extraCount] = await Promise.all([
      query("SELECT COUNT(*) FROM leads"),
      query("SELECT COUNT(*) FROM leads WHERE situacao_cadastral = 2"),
      query("SELECT COUNT(*) FROM leads WHERE email IS NOT NULL AND email != ''"),
      query("SELECT COUNT(*) FROM leads WHERE telefone1 IS NOT NULL AND telefone1 != ''"),
      query("SELECT porte, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY porte ORDER BY total DESC"),
      query("SELECT uf, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY uf ORDER BY total DESC LIMIT 10"),
      pool.query("SELECT COUNT(*) FROM leads_extra").catch(() => ({ rows: [{ count: '0' }] })),
    ]);
    const totalCnpjs  = parseInt(total.rows[0].count);
    const totalExtras = parseInt(extraCount.rows[0].count) || 0;
    res.json({
      total_cnpjs:    totalCnpjs + totalExtras,
      empresas_ativas: parseInt(ativos.rows[0].count) + totalExtras,
      com_email:      parseInt(comEmail.rows[0].count),
      com_telefone:   parseInt(comTel.rows[0].count),
      leads_instagram: totalExtras,
      por_porte:      porPorte.rows,
      top_ufs:        porUF.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/stats/ddd/:ddd", async (req, res) => {
  try {
    const { ddd } = req.params;
    const [total, porCnae, cidades] = await Promise.all([
      query("SELECT COUNT(*) FROM leads WHERE ddd_municipio=$1 AND situacao_cadastral=2", [ddd]),
      query("SELECT cnae_descricao, COUNT(*) as total FROM leads WHERE ddd_municipio=$1 AND situacao_cadastral=2 AND cnae_descricao IS NOT NULL GROUP BY cnae_descricao ORDER BY total DESC LIMIT 20", [ddd]),
      query("SELECT municipio_nome, COUNT(*) as total FROM leads WHERE ddd_municipio=$1 AND situacao_cadastral=2 GROUP BY municipio_nome ORDER BY total DESC LIMIT 10", [ddd]),
    ]);
    res.json({ ddd, total_leads: parseInt(total.rows[0].count), top_segmentos: porCnae.rows, top_cidades: cidades.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/stats/segmentos", async (req, res) => {
  try {
    const { ddd } = req.query;
    const params = ddd ? [ddd] : [];
    const where = ddd ? "WHERE l.ddd_municipio = $1 AND l.situacao_cadastral = 2" : "WHERE l.situacao_cadastral = 2";
    const result = await query("SELECT c.descricao as segmento, COUNT(l.cnpj) as total FROM leads l JOIN cnaes c ON c.codigo = l.cnae_principal " + where + " GROUP BY c.descricao ORDER BY total DESC LIMIT 20", params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/campanha/listar", async (req, res) => {
  try {
    const result = await query("SELECT * FROM campanhas ORDER BY created_at DESC LIMIT 50");
    res.json({ campanhas: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/campanha/criar-lista", async (req, res) => {
  try {
    const { nome, canal, cnpjs, mensagem_template, delay_segundos = 60 } = req.body;
    if (!nome || !canal || !cnpjs?.length) return res.status(400).json({ error: "Dados incompletos" });
    const result = await query("INSERT INTO campanhas (nome, canal, total, status, mensagem_template, delay_segundos, created_at) VALUES ($1, $2, $3, 'pendente', $4, $5, NOW()) RETURNING id", [nome, canal, cnpjs.length, mensagem_template, delay_segundos]);
    const campanha_id = result.rows[0].id;
    const cleanCnpjs = cnpjs.map(c => c.replace(/\D/g, "").padStart(14, "0"));
    await query(
      "INSERT INTO campanha_destinatarios (campanha_id, cnpj, status) SELECT $1, unnest($2::varchar[]), 'pendente'",
      [campanha_id, cleanCnpjs]
    );
    res.json({ campanha_id, total: cnpjs.length, status: "pendente" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/campanha/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const [camp, stats] = await Promise.all([
      query("SELECT * FROM campanhas WHERE id=$1", [id]),
      query("SELECT status, COUNT(*) as total FROM campanha_destinatarios WHERE campanha_id=$1 GROUP BY status", [id]),
    ]);
    if (!camp.rows.length) return res.status(404).json({ error: "Campanha nao encontrada" });
    const contagem = {};
    stats.rows.forEach(r => contagem[r.status] = parseInt(r.total));
    res.json({ ...camp.rows[0], contagem, progresso_pct: camp.rows[0].total ? Math.round(((contagem.enviado || 0) / camp.rows[0].total) * 100) : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch("/campanha/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await query("UPDATE campanhas SET status=$1 WHERE id=$2", [status, id]);
    res.json({ ok: true, id, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/whatsapp/qr", async (req, res) => {
  try {
    const url = process.env.EVOLUTION_URL;
    const key = process.env.EVOLUTION_KEY;
    const inst = process.env.EVOLUTION_INSTANCE || "leadhunter";
    if (!url || !key) return res.status(400).json({ error: "EVOLUTION_URL ou EVOLUTION_KEY nao configurados" });
    const r = await axios.get(url + "/instance/qrcode/" + inst, { headers: { apikey: key }, timeout: 10000 });
    res.json({ qr: r.data?.qrcode?.base64 || r.data?.base64 || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/whatsapp/status", async (req, res) => {
  try {
    const url = process.env.EVOLUTION_URL;
    const key = process.env.EVOLUTION_KEY;
    const inst = process.env.EVOLUTION_INSTANCE || "leadhunter";
    const r = await axios.get(url + "/instance/connectionState/" + inst, { headers: { apikey: key }, timeout: 8000 });
    res.json({ connected: r.data?.instance?.state === "open", state: r.data?.instance?.state });
  } catch (err) {
    res.json({ connected: false, state: "error", error: err.message });
  }
});
// ── ASSINATURAS / KIRVANO ──────────────────────────────────────────────────

function gerarToken() {
  return require("crypto").randomBytes(32).toString("hex");
}

// Verifica se o token de assinante é válido — usado como middleware nas rotas pagas
function authAssinante(req, res, next) {
  const token = req.headers["x-assinante-token"] || req.query.token;
  if (!token) return res.status(401).json({ error: "Token de assinante não informado" });
  pool.query("SELECT * FROM assinantes WHERE token=$1 AND status='ativo'", [token])
    .then(r => {
      if (!r.rows.length) return res.status(401).json({ error: "Assinatura inativa ou token inválido" });
      req.assinante = r.rows[0];
      next();
    })
    .catch(() => res.status(500).json({ error: "Erro ao verificar assinatura" }));
}

// Webhook da Kirvano — chamado automaticamente após pagamento aprovado/cancelado
app.post("/webhook/kirvano", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const body = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
    const payload = JSON.parse(body);

    // Kirvano envia evento em payload.event ou payload.type
    const evento = (payload.event || payload.type || "").toLowerCase();
    const dados  = payload.data || payload;

    // Extrai dados do cliente
    const email = dados.customer?.email || dados.email || dados.buyer?.email;
    const nome  = dados.customer?.name  || dados.name  || dados.buyer?.name || "";
    const txId  = dados.transaction?.id || dados.id    || dados.order_id    || "";

    // Classifica o evento
    const ePagamento  = ["approved","paid","complete","renewed","reactivated","active"].some(k => evento.includes(k));
    const eCancelado  = ["cancel","refund","chargeback","refused"].some(k => evento.includes(k));
    const status = ePagamento ? "ativo" : eCancelado ? "cancelado" : null;

    console.log(`[Kirvano] evento="${evento}" email="${email}" status="${status}"`);
    if (!email || !status) return res.json({ ok: true, msg: "evento ignorado: " + evento });

    const planoDetectado = ePagamento ? detectarPlano(dados) : null;
    const expiraEm       = ePagamento ? calcularExpiracao(planoDetectado) : null;

    // Verifica se já existe
    const existing = await pool.query("SELECT * FROM assinantes WHERE email=$1", [email]);

    if (existing.rows.length) {
      if (ePagamento) {
        // Renovação ou upgrade — atualiza plano, expiry e status
        await pool.query(
          "UPDATE assinantes SET status='ativo', plano=$2, kirvano_transaction_id=$3, expira_em=$4, updated_at=NOW() WHERE email=$1",
          [email, planoDetectado, txId, expiraEm]
        );
      } else {
        // Cancelamento, reembolso, chargeback — bloqueia imediatamente
        await pool.query(
          "UPDATE assinantes SET status='cancelado', expira_em=NOW(), kirvano_transaction_id=$2, updated_at=NOW() WHERE email=$1",
          [email, txId]
        );
      }
      console.log(`[Kirvano] ${email} → ${status} plano=${planoDetectado}${expiraEm ? ' até ' + expiraEm.toLocaleDateString('pt-BR') : ''}`);
    } else if (ePagamento) {
      const token = gerarToken();
      await pool.query(
        "INSERT INTO assinantes(email,nome,status,token,kirvano_transaction_id,plano,ativado_em,expira_em) VALUES($1,$2,'ativo',$3,$4,$5,NOW(),$6)",
        [email, nome, token, txId, planoDetectado, expiraEm]
      );
      console.log(`[Kirvano] novo assinante: ${email} plano=${planoDetectado}`);

      // Envia email com o token (se RESEND_API_KEY configurado)
      const resendKey = process.env.RESEND_API_KEY;
      const emailFrom = process.env.EMAIL_FROM || "noreply@leadhunter.app";
      if (resendKey) {
        await axios.post("https://api.resend.com/emails", {
          from: emailFrom,
          to:   email,
          subject: "🦊 Seu acesso ao LeadHunter Pro está pronto!",
          html: `
            <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#08080f;color:#eeeef2;padding:32px;border-radius:16px">
              <h2 style="color:#f09030;margin-bottom:8px">Bem-vindo ao LeadHunter Pro! 🦊</h2>
              <p style="color:#8888a0;margin-bottom:24px">Olá${nome ? " " + nome.split(" ")[0] : ""}! Seu pagamento foi confirmado.</p>
              <p style="margin-bottom:8px">Seu token de acesso:</p>
              <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.3);border-radius:10px;padding:16px;font-family:monospace;font-size:14px;letter-spacing:1px;word-break:break-all;color:#f5b455">
                ${token}
              </div>
              <p style="color:#8888a0;font-size:13px;margin-top:16px">Cole esse token em <b style="color:#eeeef2">Configurações → Token de Acesso</b> dentro do LeadHunter.</p>
              <a href="https://leadhunter-vert.vercel.app" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#f09030,#e06818);color:#000;font-weight:700;padding:12px 24px;border-radius:9px;text-decoration:none">
                Acessar LeadHunter →
              </a>
            </div>
          `,
        }, { headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" } }).catch(e => console.error("[Resend]", e.message));
      }
    }

    res.json({ ok: true });
  } catch(e) {
    console.error("[Kirvano webhook] erro:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── HELPERS DE PLANO ──────────────────────────────────────────────────────────
function detectarPlano(dados) {
  const txt = JSON.stringify(dados).toLowerCase();
  if (txt.includes('vitalicio') || txt.includes('vitalício') || txt.includes('lifetime') || txt.includes('vitalic')) return 'vitalicio';
  if (txt.includes('trimestral') || txt.includes('quarterly') || txt.includes('3 meses') || txt.includes('3meses')) return 'trimestral';
  return 'mensal';
}

function calcularExpiracao(plano) {
  if (plano === 'vitalicio') return null;
  const dias = plano === 'trimestral' ? 95 : 35;
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
}

async function processarPagamento(email, nome, txId, dados, plataforma) {
  const plano    = detectarPlano(dados);
  const expiraEm = calcularExpiracao(plano);
  const existing = await pool.query("SELECT * FROM assinantes WHERE email=$1", [email]);
  if (existing.rows.length) {
    await pool.query(
      "UPDATE assinantes SET status='ativo', plano=$2, expira_em=$3, updated_at=NOW() WHERE email=$1",
      [email, plano, expiraEm]
    );
    console.log(`[${plataforma}] renovacao/upgrade: ${email} → plano ${plano}`);
    return null;
  }
  const token = gerarToken();
  await pool.query(
    "INSERT INTO assinantes(email,nome,status,token,plano,ativado_em,expira_em) VALUES($1,$2,'ativo',$3,$4,NOW(),$5)",
    [email, nome, token, plano, expiraEm]
  );
  console.log(`[${plataforma}] novo assinante: ${email} plano=${plano}`);
  return token;
}

async function enviarEmailBoasVindas(email, nome, token, plano) {
  const resendKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "noreply@leadhunter.app";
  if (!resendKey || !token) return;
  const planosLabel = { mensal:'Mensal — R$77', trimestral:'Trimestral — R$190', vitalicio:'Vitalício — R$350' };
  const limiteLabel = plano === 'mensal' ? '150 leads/dia' : 'Ilimitado';
  await axios.post("https://api.resend.com/emails", {
    from: emailFrom, to: email,
    subject: "🦊 Seu acesso ao LeadHunter Pro está pronto!",
    html: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;background:#08080f;color:#eeeef2;padding:32px;border-radius:16px">
      <h2 style="color:#f09030;margin-bottom:4px">Bem-vindo ao LeadHunter Pro! 🦊</h2>
      <p style="color:#8888a0;margin-bottom:24px">Olá${nome?" "+nome.split(" ")[0]:""}! Seu pagamento foi confirmado.</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.2);border-radius:10px;padding:16px;margin-bottom:20px">
        <div style="font-size:12px;color:#8888a0;margin-bottom:4px">Plano ativo</div>
        <div style="font-size:16px;font-weight:700;color:#f09030">${planosLabel[plano]||plano}</div>
        <div style="font-size:12px;color:#8888a0;margin-top:4px">Leads: ${limiteLabel}</div>
      </div>
      <p style="margin-bottom:8px;font-size:14px">Seu token de acesso:</p>
      <div style="background:#1d1d28;border:1px solid rgba(240,144,48,.3);border-radius:10px;padding:16px;font-family:monospace;font-size:13px;word-break:break-all;color:#f5b455">${token}</div>
      <p style="color:#8888a0;font-size:12px;margin-top:12px">Cole em <b style="color:#eeeef2">Configurações → Token de Acesso</b></p>
      <a href="https://leadhunter-vert.vercel.app" style="display:inline-block;margin-top:20px;background:linear-gradient(135deg,#f09030,#e06818);color:#000;font-weight:700;padding:12px 24px;border-radius:9px;text-decoration:none">Acessar LeadHunter →</a>
    </div>`,
  }, { headers: { Authorization:`Bearer ${resendKey}`, "Content-Type":"application/json" } }).catch(e => console.error("[Resend]", e.message));
}

// ── WEBHOOK CAKTO ─────────────────────────────────────────────────────────────
async function handleCaktoWebhook(req, res) {
  try {
    const body    = typeof req.body === "string" ? req.body : req.body.toString("utf-8");
    const payload = JSON.parse(body);
    const evento  = (payload.event || payload.type || payload.status || "").toLowerCase();
    const dados   = payload.data || payload.checkout || payload;
    const email   = dados.customer?.email || dados.customer_email || dados.buyer?.email || dados.email;
    const nome    = dados.customer?.name  || dados.customer_name  || dados.buyer?.name  || dados.name || "";
    const txId    = dados.order?.id       || dados.transaction_id || dados.order_id     || payload.id || "";

    const ePagamento = ["approved","paid","complete","renewed","active","created","success"].some(k => evento.includes(k));
    const eCancelado = ["cancel","refund","chargeback","refused"].some(k => evento.includes(k));

    console.log(`[Cakto] evento="${evento}" email="${email}"`);
    if (!email) return res.json({ ok: true, msg: "sem email no payload" });

    if (eCancelado && !ePagamento) {
      await pool.query("UPDATE assinantes SET status='cancelado', expira_em=NOW(), updated_at=NOW() WHERE email=$1", [email]);
      console.log(`[Cakto] cancelado: ${email}`);
      return res.json({ ok: true });
    }

    if (ePagamento) {
      const token = await processarPagamento(email, nome, txId, dados, 'Cakto');
      await enviarEmailBoasVindas(email, nome, token, detectarPlano(dados));
    }

    res.json({ ok: true });
  } catch(e) {
    console.error("[Cakto webhook] erro:", e.message);
    res.status(500).json({ error: e.message });
  }
}

const rawBody = express.raw({ type: "*/*" });
app.get("/webhook/cakto", (req, res) => res.json({ ok: true, service: "LeadHunter webhook" }));
app.get("/webhook",       (req, res) => res.json({ ok: true, service: "LeadHunter webhook" }));
app.post("/webhook/cakto", rawBody, handleCaktoWebhook);
app.post("/webhook",       rawBody, handleCaktoWebhook);

// Login por email — retorna token se assinatura ativa
app.post("/auth/login", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email obrigatório" });
    const r = await pool.query("SELECT nome, token, status, ativado_em, expira_em FROM assinantes WHERE email=$1", [email.toLowerCase().trim()]);
    if (!r.rows.length) return res.status(404).json({ error: "Email não encontrado. Assine o plano para ter acesso." });
    const a = r.rows[0];
    if (a.status !== "ativo") return res.status(403).json({ error: "Assinatura cancelada ou inativa. Verifique seu pagamento." });
    if (a.expira_em && new Date(a.expira_em) < new Date()) {
      await pool.query("UPDATE assinantes SET status='expirado' WHERE email=$1", [email]).catch(() => {});
      return res.status(403).json({ error: "Assinatura expirada. Renove para continuar." });
    }
    res.json({ token: a.token, nome: a.nome, ativado_em: a.ativado_em });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Verifica token — frontend chama isso ao carregar
app.get("/auth/verificar", async (req, res) => {
  const token = req.headers["x-assinante-token"] || req.query.token;
  if (!token) return res.status(401).json({ ok: false });
  const r = await pool.query(
    "SELECT nome, email, status, expira_em, plano, leads_hoje, leads_data FROM assinantes WHERE token=$1", [token]
  ).catch(() => ({ rows: [] }));
  if (!r.rows.length) return res.status(401).json({ ok: false, motivo: "token inválido" });
  const a = r.rows[0];
  if (a.status !== "ativo") return res.status(401).json({ ok: false, motivo: "assinatura cancelada" });
  if (a.expira_em && new Date(a.expira_em) < new Date()) {
    await pool.query("UPDATE assinantes SET status='expirado' WHERE token=$1", [token]).catch(() => {});
    return res.status(401).json({ ok: false, motivo: "assinatura expirada" });
  }

  const hoje = new Date().toISOString().split('T')[0];
  const ultimaData = a.leads_data ? new Date(a.leads_data).toISOString().split('T')[0] : null;
  const usadoHoje = ultimaData === hoje ? (a.leads_hoje || 0) : 0;

  res.json({
    ok: true,
    nome: a.nome,
    email: a.email,
    plano: a.plano || 'mensal',
    expira_em: a.expira_em,
    cota: a.plano === 'mensal' ? {
      limite: LIMITE_MENSAL_DIA,
      usado: usadoHoje,
      restante: Math.max(0, LIMITE_MENSAL_DIA - usadoHoje)
    } : null
  });
});

// ── APIFY INSTAGRAM SCRAPING ──────────────────────────────────────────────────
// POST /admin/apify-start  → inicia run no Apify, retorna runId
// ── ADMIN: ASSINANTES ────────────────────────────────────────────────────────
app.get("/admin/assinantes", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, email, nome, plano, status, ativado_em, expira_em, leads_hoje, leads_data, updated_at
      FROM assinantes ORDER BY ativado_em DESC LIMIT 200
    `);
    res.json({ total: r.rows.length, assinantes: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/assinante/criar", async (req, res) => {
  try {
    const { email, nome, plano = 'mensal' } = req.body;
    if (!email) return res.status(400).json({ error: "email obrigatório" });
    const expiraEm = calcularExpiracao(plano);
    const token = require("crypto").randomBytes(32).toString("hex");
    const existing = await pool.query("SELECT id, token FROM assinantes WHERE email=$1", [email]);
    if (existing.rows.length) {
      await pool.query("UPDATE assinantes SET nome=$2, plano=$3, status='ativo', expira_em=$4, updated_at=NOW() WHERE email=$1",
        [email, nome||existing.rows[0].nome, plano, expiraEm]);
      return res.json({ ok: true, token: existing.rows[0].token, msg: "Assinante atualizado" });
    }
    await pool.query("INSERT INTO assinantes(email,nome,status,token,plano,ativado_em,expira_em) VALUES($1,$2,'ativo',$3,$4,NOW(),$5)",
      [email, nome||'', token, plano, expiraEm]);
    res.json({ ok: true, token, msg: "Assinante criado" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch("/admin/assinante/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ativo','cancelado','expirado'].includes(status)) return res.status(400).json({ error: "status inválido" });
    await pool.query("UPDATE assinantes SET status=$1, updated_at=NOW() WHERE id=$2", [status, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET  /admin/apify-import/:runId?apify_key=xxx  → importa resultados quando o run terminar

const APIFY_HASHTAGS = [
  // Barbearia
  "barbearia","barberashop","barbeirosbrasil","barber",
  // Clínica Estética
  "clinicaestetica","esteticafacial","esteticacorporal","esteticabrasil",
  // Petshop
  "petshop","petshopbrasil","clinicaveterinaria","petlovers",
  // Academia / Fitness
  "academia","crossfit","pilates","musculacao"
];

const APIFY_SEG = {
  barbearia:"barbearia", barberashop:"barbearia", barbeirosbrasil:"barbearia", barber:"barbearia",
  clinicaestetica:"clinicaestetica", esteticafacial:"clinicaestetica", esteticacorporal:"clinicaestetica", esteticabrasil:"clinicaestetica",
  petshop:"petshop", petshopbrasil:"petshop", clinicaveterinaria:"petshop", petlovers:"petshop",
  academia:"academia", crossfit:"academia", pilates:"academia", musculacao:"academia"
};

app.post("/admin/apify-start", async (req, res) => {
  const key = process.env.APIFY_KEY || req.headers["x-apify-key"] || req.body?.apify_key;
  if (!key) return res.status(400).json({ error: "Apify key necessária (body: apify_key ou header x-apify-key)" });

  const directUrls = APIFY_HASHTAGS.map(h => `https://www.instagram.com/explore/tags/${h}/`);

  try {
    const r = await axios.post(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${key}`,
      {
        directUrls,
        resultsType: "posts",
        resultsLimit: 300,
        proxy: { useApifyProxy: true }
      }
    );
    const runId = r.data.data.id;
    console.log(`[Apify] Run iniciado: ${runId}`);
    res.json({
      ok: true, runId,
      proximo: `GET /admin/apify-import/${runId}?apify_key=${key}`,
      msg: "Run iniciado! Aguarde ~5-15 min, depois chame o endpoint proximo."
    });
  } catch(e) {
    console.error("[Apify] Erro ao iniciar:", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

app.get("/admin/apify-import/:runId", async (req, res) => {
  const key = process.env.APIFY_KEY || req.headers["x-apify-key"] || req.query.apify_key;
  if (!key) return res.status(400).json({ error: "Apify key necessária (?apify_key=xxx)" });
  const { runId } = req.params;

  try {
    // Verifica status
    const statusRes = await axios.get(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs/${runId}?token=${key}`
    );
    const runData = statusRes.data.data;
    const status  = runData.status;

    if (status === "RUNNING" || status === "READY" || status === "ABORTING") {
      return res.json({ ok: false, status, msg: "Run ainda em execução. Aguarde e tente novamente." });
    }
    if (status !== "SUCCEEDED") {
      return res.json({ ok: false, status, msg: "Run não completou com sucesso: " + status });
    }

    // Busca os itens do dataset (paginado em até 5000)
    const dsId = runData.defaultDatasetId;
    const itemsRes = await axios.get(
      `https://api.apify.com/v2/datasets/${dsId}/items?token=${key}&limit=5000&offset=0`
    );
    const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];
    console.log(`[Apify] ${items.length} itens para processar`);

    // De-duplica por ownerUsername dentro dos resultados
    const seen = new Set();
    let inseridos = 0, atualizados = 0, ignorados = 0;

    for (const item of items) {
      const handle = item.ownerUsername || item.username;
      if (!handle || seen.has(handle)) { ignorados++; continue; }
      seen.add(handle);

      // Mapeia segmento pelo inputUrl (hashtag usada na busca) — mais confiável
      const inputUrl = (item.inputUrl || "").toLowerCase();
      const matchedTag = Object.keys(APIFY_SEG).find(t => inputUrl.includes("/" + t + "/"));
      const segmento = matchedTag ? APIFY_SEG[matchedTag] : "geral";

      const igVal   = "@" + handle;
      const website = item.externalUrl || null;
      const nome    = item.ownerFullName || item.fullName || handle;
      const bio     = item.biography || item.ownerBiography || null;
      const cidade  = item.locationCity || null;
      const estado  = item.locationState || null;

      try {
        const ex = await pool.query(
          "SELECT id FROM leads_extra WHERE instagram ILIKE $1 LIMIT 1",
          ["%" + handle + "%"]
        );
        if (ex.rows.length) {
          await pool.query(
            `UPDATE leads_extra SET
               nome     = COALESCE(NULLIF(nome,''),     $2),
               website  = COALESCE(NULLIF(website,''),  $3),
               segmento = COALESCE(NULLIF(segmento,''), $4),
               descricao= COALESCE(NULLIF(descricao,''),$5)
             WHERE id = $1`,
            [ex.rows[0].id, nome, website, segmento, bio]
          );
          atualizados++;
        } else {
          await pool.query(
            `INSERT INTO leads_extra(nome, instagram, website, descricao, segmento, cidade, estado, pais, created_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,'Brasil',NOW())`,
            [nome, igVal, website, bio, segmento, cidade, estado]
          );
          inseridos++;
        }
      } catch(dbErr) {
        console.error("[Apify] DB error para @" + handle + ":", dbErr.message);
      }
    }

    console.log(`[Apify] Import: ${inseridos} inseridos, ${atualizados} atualizados, ${ignorados} ignorados`);
    res.json({ ok: true, status, total_items: items.length, unique_handles: seen.size, inseridos, atualizados, ignorados });
  } catch(e) {
    console.error("[Apify] Erro no import:", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// POST /admin/apify-enrich?apify_key=xxx  → scrapa perfis sem website para pegar bio/site/categoria
app.post("/admin/apify-enrich", async (req, res) => {
  const key = process.env.APIFY_KEY || req.headers["x-apify-key"] || req.body?.apify_key || req.query.apify_key;
  if (!key) return res.status(400).json({ error: "Apify key necessária" });
  const limit = Math.min(500, parseInt(req.query.limit) || 200);

  try {
    // Busca leads com instagram mas sem website
    const r = await pool.query(
      `SELECT id, instagram FROM leads_extra
       WHERE instagram IS NOT NULL AND instagram != ''
         AND (website IS NULL OR website = '')
       ORDER BY id DESC LIMIT $1`,
      [limit]
    );
    if (!r.rows.length) return res.json({ ok: true, msg: "Todos os leads já têm website", count: 0 });

    // Extrai o handle e monta URLs de perfil
    const profileUrls = [];
    const handleMap  = {};
    for (const row of r.rows) {
      const ig = row.instagram.replace(/^@/, "").trim();
      if (!ig) continue;
      const url = `https://www.instagram.com/${ig}/`;
      profileUrls.push(url);
      handleMap[url] = { id: row.id, handle: ig };
    }

    // Dispara Apify scraper em modo "details" (perfil completo)
    const runRes = await axios.post(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=${key}`,
      { directUrls: profileUrls, resultsType: "details", resultsLimit: 1, proxy: { useApifyProxy: true } }
    );
    const runId = runRes.data.data.id;
    console.log(`[Apify-Enrich] Run ${runId} iniciado para ${profileUrls.length} perfis`);
    res.json({ ok: true, runId, profiles: profileUrls.length,
      proximo: `GET /admin/apify-enrich-import/${runId}?apify_key=${key}` });
  } catch(e) {
    console.error("[Apify-Enrich]", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// GET /admin/apify-enrich-import/:runId → importa dados de perfil e atualiza leads_extra
app.get("/admin/apify-enrich-import/:runId", async (req, res) => {
  const key = process.env.APIFY_KEY || req.headers["x-apify-key"] || req.query.apify_key;
  if (!key) return res.status(400).json({ error: "Apify key necessária" });
  const { runId } = req.params;

  try {
    const statusRes = await axios.get(
      `https://api.apify.com/v2/acts/apify~instagram-scraper/runs/${runId}?token=${key}`
    );
    const run = statusRes.data.data;
    if (run.status !== "SUCCEEDED") return res.json({ ok: false, status: run.status });

    const itemsRes = await axios.get(
      `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${key}&limit=5000`
    );
    const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];
    let atualizados = 0, filtrados = 0;

    const BIZ_CAT = {
      "barber": "barbearia", "hair": "barbearia", "salon": "barbearia",
      "pet": "petshop", "veterin": "petshop", "animal": "petshop",
      "gym": "academia", "fitness": "academia", "crossfit": "academia", "pilates": "academia", "sport": "academia",
      "estetic": "clinicaestetica", "clinic": "clinicaestetica", "skin": "clinicaestetica", "beauty": "clinicaestetica", "spa": "clinicaestetica"
    };

    for (const item of items) {
      const handle = item.username;
      if (!handle) { filtrados++; continue; }

      // Filtra: conta de negócio com pelo menos 50 seguidores
      const isBiz = item.isBusinessAccount || item.businessCategoryName;
      if (!isBiz) { filtrados++; continue; }
      if ((item.followersCount || 0) < 50) { filtrados++; continue; }

      const website = item.externalUrl || item.bioLinks?.[0]?.url || null;
      const bio     = item.biography || null;
      const nome    = item.fullName  || null;
      const cidade  = item.cityName  || null;

      // Segmento pela categoria do Instagram
      let segmento = null;
      if (item.businessCategoryName) {
        const cat = item.businessCategoryName.toLowerCase();
        const found = Object.keys(BIZ_CAT).find(k => cat.includes(k));
        if (found) segmento = BIZ_CAT[found];
      }

      await pool.query(
        `UPDATE leads_extra SET
           nome     = COALESCE(NULLIF(nome,''),     $2),
           website  = COALESCE(NULLIF(website,''),  $3),
           descricao= COALESCE(NULLIF(descricao,''),$4),
           segmento = COALESCE(NULLIF(segmento,''), $5),
           cidade   = COALESCE(NULLIF(cidade,''),   $6)
         WHERE instagram ILIKE $1`,
        ["%" + handle + "%", nome, website, bio, segmento, cidade]
      );
      atualizados++;
    }

    console.log(`[Apify-Enrich] ${atualizados} atualizados, ${filtrados} filtrados`);
    res.json({ ok: true, total_items: items.length, atualizados, filtrados });
  } catch(e) {
    console.error("[Apify-Enrich-Import]", e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// ── FRONTEND ──
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/landing", (req, res) => res.sendFile(path.join(__dirname, "landing.html")));

async function criarSchema() {
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS campanhas (id BIGSERIAL PRIMARY KEY, nome VARCHAR(200), canal VARCHAR(20), total INT, enviados INT DEFAULT 0, status VARCHAR(20) DEFAULT 'pendente', mensagem_template TEXT, delay_segundos INT DEFAULT 60, created_at TIMESTAMPTZ DEFAULT NOW(), iniciado_at TIMESTAMPTZ, concluido_at TIMESTAMPTZ)");
    await pool.query("CREATE TABLE IF NOT EXISTS campanha_destinatarios (id BIGSERIAL PRIMARY KEY, campanha_id BIGINT REFERENCES campanhas(id), cnpj VARCHAR(14), status VARCHAR(20) DEFAULT 'pendente', enviado_at TIMESTAMPTZ, erro TEXT)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_dest_campanha ON campanha_destinatarios(campanha_id, status)");
    await pool.query("CREATE TABLE IF NOT EXISTS assinantes (id BIGSERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, nome VARCHAR(255), status VARCHAR(20) DEFAULT 'ativo', token VARCHAR(100) UNIQUE, kirvano_transaction_id VARCHAR(200), plano VARCHAR(50) DEFAULT 'mensal', ativado_em TIMESTAMPTZ DEFAULT NOW(), expira_em TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW())");
    await pool.query("ALTER TABLE assinantes ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ");
    await pool.query("ALTER TABLE assinantes ADD COLUMN IF NOT EXISTS leads_hoje INT DEFAULT 0");
    await pool.query("ALTER TABLE assinantes ADD COLUMN IF NOT EXISTS leads_data DATE DEFAULT CURRENT_DATE");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_assinantes_token ON assinantes(token)");
    console.log("Schema verificado");
  } catch (e) {
    console.error("Erro schema:", e.message);
  }
}
const PORT = process.env.PORT || 3000;
(async () => {
  let tentativas = 0;
  while (tentativas < 5) {
    try {
      await pool.query("SELECT 1");
      console.log("Banco conectado");
      break;
    } catch (e) {
      tentativas++;
      console.error("Tentativa " + tentativas + "/5 falhou: " + e.message);
      if (tentativas >= 5) { console.error("Nao foi possivel conectar ao banco — continuando mesmo assim."); break; }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  await criarSchema();
  app.listen(PORT, "0.0.0.0", () => { console.log("LeadHunter API rodando na porta " + PORT); });
})();
