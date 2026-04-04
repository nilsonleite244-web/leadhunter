/**
 * LeadHunter Pro — API Backend
 * ==============================
 * Roda no Railway (gratuito). Conecta no Supabase PostgreSQL.
 * Fornece todos os endpoints que a Base44 vai chamar.
 *
 * npm install express pg dotenv cors express-rate-limit node-cron axios
 * node server.js
 */

const express    = require("express");
const { Pool }   = require("pg");
const cors       = require("cors");
const rateLimit  = require("express-rate-limit");
const cron       = require("node-cron");
const axios      = require("axios");
require("dotenv").config();

const app  = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(cors());
app.use(express.json());

// Rate limit básico (evita abuso)
app.use(rateLimit({ windowMs: 60_000, max: 200, message: { error: "Muitas requisições" } }));

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const query = (sql, params) => pool.query(sql, params);

function paginate(req) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// ─── ENDPOINTS DE LEADS ───────────────────────────────────────────────────────

/**
 * GET /leads/buscar
 * 
 * Parâmetros de filtro:
 *   ddd          string|string[]   ex: "11" ou "11,21,31"
 *   uf           string            ex: "SP"
 *   cnae         string            ex: "5611201" ou "5611201,5611203"
 *   porte        string            ME | MEI | EPP | DEMAIS
 *   tem_email    boolean
 *   tem_telefone boolean
 *   simples      boolean           optante Simples Nacional
 *   mei          boolean           MEI
 *   abertura_de  date              yyyy-mm-dd
 *   abertura_ate date              yyyy-mm-dd
 *   score_min    int               0-100
 *   busca        string            texto livre (razão social / fantasia)
 *   page         int               default 1
 *   limit        int               default 50, max 500
 */
app.get("/leads/buscar", async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const {
      ddd, uf, cnae, porte, tem_email, tem_telefone,
      simples, mei, abertura_de, abertura_ate, score_min, busca
    } = req.query;

    const conditions = ["l.situacao_cadastral = 2"]; // só ativas
    const params     = [];
    let   p          = 1;

    if (ddd) {
      const ddds = ddd.split(",").map(d => d.trim());
      conditions.push(`l.ddd_municipio = ANY($${p++})`);
      params.push(ddds);
    }

    if (uf) {
      conditions.push(`l.uf = $${p++}`);
      params.push(uf.toUpperCase());
    }

    if (cnae) {
      const cnaes = cnae.split(",").map(c => c.trim());
      conditions.push(`l.cnae_principal = ANY($${p++})`);
      params.push(cnaes);
    }

    if (porte) {
      conditions.push(`l.porte = $${p++}`);
      params.push(porte.toUpperCase());
    }

    if (tem_email === "true") {
      conditions.push("l.email IS NOT NULL AND l.email != ''");
    }

    if (tem_telefone === "true") {
      conditions.push("l.telefone1 IS NOT NULL AND l.telefone1 != ''");
    }

    if (simples === "true") {
      conditions.push("l.optante_simples = TRUE");
    }

    if (mei === "true") {
      conditions.push("l.optante_mei = TRUE");
    }

    if (abertura_de) {
      conditions.push(`l.data_abertura >= $${p++}`);
      params.push(abertura_de);
    }

    if (abertura_ate) {
      conditions.push(`l.data_abertura <= $${p++}`);
      params.push(abertura_ate);
    }

    if (score_min) {
      conditions.push(`l.score_completude >= $${p++}`);
      params.push(parseInt(score_min));
    }

    if (busca && busca.trim()) {
      conditions.push(`to_tsvector('portuguese', coalesce(l.razao_social,'') || ' ' || coalesce(l.nome_fantasia,'')) @@ plainto_tsquery('portuguese', $${p++})`);
      params.push(busca.trim());
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    // Count total
    const countSql  = `SELECT COUNT(*) FROM leads l ${where}`;
    const countRes  = await query(countSql, params);
    const total     = parseInt(countRes.rows[0].count);

    // Busca paginada
    const dataSql = `
      SELECT
        l.cnpj,
        l.razao_social,
        l.nome_fantasia,
        l.cnae_principal,
        l.cnae_descricao,
        l.porte,
        l.email,
        l.telefone1,
        l.telefone2,
        l.ddd_municipio,
        l.municipio_nome,
        l.uf,
        l.logradouro,
        l.numero,
        l.bairro,
        l.cep,
        l.data_abertura,
        l.optante_simples,
        l.optante_mei,
        l.nome_socio,
        l.score_completude
      FROM leads l
      ${where}
      ORDER BY l.score_completude DESC, l.data_abertura DESC
      LIMIT $${p++} OFFSET $${p++}
    `;
    params.push(limit, offset);

    const dataRes = await query(dataSql, params);

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data:  dataRes.rows,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /leads/:cnpj
 * Detalhe completo de um lead + enriquecimento via CNPJ.ws (gratuito)
 */
app.get("/leads/:cnpj", async (req, res) => {
  try {
    const cnpj = req.params.cnpj.replace(/\D/g, "").padStart(14, "0");

    // Busca no banco local
    const local = await query("SELECT * FROM leads WHERE cnpj = $1", [cnpj]);
    if (!local.rows.length) {
      return res.status(404).json({ error: "CNPJ não encontrado" });
    }

    const lead = local.rows[0];

    // Enriquece via CNPJ.ws (API pública gratuita, sem key)
    if (req.query.enriquecer === "true") {
      try {
        const ext = await axios.get(`https://publica.cnpj.ws/cnpj/${cnpj}`, { timeout: 5000 });
        const d   = ext.data;

        // Mescla dados externos
        if (d.estabelecimento?.email && !lead.email) {
          lead.email = d.estabelecimento.email;
        }
        if (d.estabelecimento?.telefone1 && !lead.telefone1) {
          const ddd = d.estabelecimento.ddd1 || "";
          lead.telefone1 = ddd ? `(${ddd}) ${d.estabelecimento.telefone1}` : d.estabelecimento.telefone1;
        }
        if (d.socios?.length && !lead.nome_socio) {
          lead.nome_socio = d.socios[0]?.nome;
        }

        lead._enriquecido = true;
        lead._fonte_extra = "cnpj.ws";

        // Salva enriquecimento no banco
        await query(
          "UPDATE leads SET email=$1, telefone1=$2, nome_socio=$3, updated_at=NOW() WHERE cnpj=$4",
          [lead.email, lead.telefone1, lead.nome_socio, cnpj]
        );

      } catch (e) {
        lead._enriquecido = false;
        lead._enriquecimento_erro = e.message;
      }
    }

    res.json(lead);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /leads/enriquecer-lote
 * Enriquece uma lista de CNPJs via CNPJ.ws com delay para não sobrecarregar
 * Body: { cnpjs: ["00000000000000", ...] }
 */
app.post("/leads/enriquecer-lote", async (req, res) => {
  const { cnpjs } = req.body;
  if (!cnpjs || !Array.isArray(cnpjs)) {
    return res.status(400).json({ error: "cnpjs deve ser um array" });
  }

  const MAX = 50; // máximo por vez para não abusar da API gratuita
  const lista = cnpjs.slice(0, MAX);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");
  res.write('{"resultados":[');

  let primeiro = true;

  for (const cnpj of lista) {
    const c = cnpj.replace(/\D/g, "").padStart(14, "0");
    try {
      const ext = await axios.get(`https://publica.cnpj.ws/cnpj/${c}`, { timeout: 5000 });
      const d   = ext.data;

      const email    = d.estabelecimento?.email || null;
      const ddd      = d.estabelecimento?.ddd1 || "";
      const telefone = d.estabelecimento?.telefone1
        ? (ddd ? `(${ddd}) ${d.estabelecimento.telefone1}` : d.estabelecimento.telefone1)
        : null;
      const socio    = d.socios?.[0]?.nome || null;

      await query(
        "UPDATE leads SET email=COALESCE(email,$1), telefone1=COALESCE(telefone1,$2), nome_socio=COALESCE(nome_socio,$3), updated_at=NOW() WHERE cnpj=$4",
        [email, telefone, socio, c]
      );

      if (!primeiro) res.write(",");
      res.write(JSON.stringify({ cnpj: c, ok: true, email, telefone, socio }));
      primeiro = false;

    } catch (e) {
      if (!primeiro) res.write(",");
      res.write(JSON.stringify({ cnpj: c, ok: false, erro: e.message }));
      primeiro = false;
    }

    // Delay 800ms entre chamadas para respeitar a API gratuita
    await new Promise(r => setTimeout(r, 800));
  }

  res.write("]}");
  res.end();
});


// ─── ENDPOINTS DE MÉTRICAS ────────────────────────────────────────────────────

/**
 * GET /stats/geral
 * Estatísticas gerais da base
 */
app.get("/stats/geral", async (req, res) => {
  try {
    const [total, ativos, comEmail, comTel, porPorte, porUF] = await Promise.all([
      query("SELECT COUNT(*) FROM leads"),
      query("SELECT COUNT(*) FROM leads WHERE situacao_cadastral = 2"),
      query("SELECT COUNT(*) FROM leads WHERE email IS NOT NULL AND email != ''"),
      query("SELECT COUNT(*) FROM leads WHERE telefone1 IS NOT NULL AND telefone1 != ''"),
      query("SELECT porte, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY porte ORDER BY total DESC"),
      query("SELECT uf, COUNT(*) as total FROM leads WHERE situacao_cadastral=2 GROUP BY uf ORDER BY total DESC LIMIT 10"),
    ]);

    res.json({
      total_cnpjs:      parseInt(total.rows[0].count),
      empresas_ativas:  parseInt(ativos.rows[0].count),
      com_email:        parseInt(comEmail.rows[0].count),
      com_telefone:     parseInt(comTel.rows[0].count),
      por_porte:        porPorte.rows,
      top_ufs:          porUF.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /stats/ddd/:ddd
 * Quantos leads disponíveis por DDD e por segmento
 */
app.get("/stats/ddd/:ddd", async (req, res) => {
  try {
    const { ddd } = req.params;

    const [total, porCnae, cidades] = await Promise.all([
      query(
        "SELECT COUNT(*) FROM leads WHERE ddd_municipio=$1 AND situacao_cadastral=2",
        [ddd]
      ),
      query(
        `SELECT cnae_descricao, COUNT(*) as total
         FROM leads
         WHERE ddd_municipio=$1 AND situacao_cadastral=2 AND cnae_descricao IS NOT NULL
         GROUP BY cnae_descricao
         ORDER BY total DESC
         LIMIT 20`,
        [ddd]
      ),
      query(
        `SELECT municipio_nome, COUNT(*) as total
         FROM leads
         WHERE ddd_municipio=$1 AND situacao_cadastral=2
         GROUP BY municipio_nome
         ORDER BY total DESC
         LIMIT 10`,
        [ddd]
      ),
    ]);

    res.json({
      ddd,
      total_leads: parseInt(total.rows[0].count),
      top_segmentos: porCnae.rows,
      top_cidades: cidades.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /stats/cnaes
 * Lista todos os CNAEs disponíveis com contagem
 */
app.get("/stats/cnaes", async (req, res) => {
  try {
    const result = await query(`
      SELECT c.codigo, c.descricao, c.categoria, COUNT(l.cnpj) as total
      FROM cnaes c
      LEFT JOIN leads l ON l.cnae_principal = c.codigo AND l.situacao_cadastral = 2
      GROUP BY c.codigo, c.descricao, c.categoria
      HAVING COUNT(l.cnpj) > 0
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── ENDPOINTS DE CAMPANHA (fila de envio) ────────────────────────────────────

/**
 * POST /campanha/criar-lista
 * Salva uma lista de CNPJs como campanha aguardando envio
 * Body: { nome, canal, cnpjs[], mensagem_template, delay_segundos }
 */
app.post("/campanha/criar-lista", async (req, res) => {
  try {
    const { nome, canal, cnpjs, mensagem_template, delay_segundos = 60 } = req.body;

    const result = await query(
      `INSERT INTO campanhas (nome, canal, total, status, mensagem_template, delay_segundos, created_at)
       VALUES ($1, $2, $3, 'pendente', $4, $5, NOW())
       RETURNING id`,
      [nome, canal, cnpjs.length, mensagem_template, delay_segundos]
    );

    const campanha_id = result.rows[0].id;

    // Insere destinatários
    const rows = cnpjs.map(cnpj => `('${campanha_id}', '${cnpj.replace(/\D/g, "").padStart(14,"0")}', 'pendente')`);

    // Divide em chunks para não sobrecarregar
    for (let i = 0; i < rows.length; i += 1000) {
      await query(
        `INSERT INTO campanha_destinatarios (campanha_id, cnpj, status) VALUES ${rows.slice(i, i+1000).join(",")}`
      );
    }

    res.json({ campanha_id, total: cnpjs.length, status: "pendente" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * GET /campanha/:id/status
 * Progresso de uma campanha em andamento
 */
app.get("/campanha/:id/status", async (req, res) => {
  try {
    const { id } = req.params;

    const [camp, stats] = await Promise.all([
      query("SELECT * FROM campanhas WHERE id=$1", [id]),
      query(
        `SELECT status, COUNT(*) as total
         FROM campanha_destinatarios
         WHERE campanha_id=$1
         GROUP BY status`,
        [id]
      ),
    ]);

    if (!camp.rows.length) return res.status(404).json({ error: "Campanha não encontrada" });

    const contagem = {};
    stats.rows.forEach(r => contagem[r.status] = parseInt(r.total));

    res.json({
      ...camp.rows[0],
      contagem,
      progresso_pct: camp.rows[0].total
        ? Math.round(((contagem.enviado || 0) / camp.rows[0].total) * 100)
        : 0,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── SCHEMA ADICIONAL (campanhas) ─────────────────────────────────────────────

async function criarSchemaCampanhas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campanhas (
      id                  BIGSERIAL PRIMARY KEY,
      nome                VARCHAR(200),
      canal               VARCHAR(20),  -- whatsapp | email
      total               INT,
      enviados            INT DEFAULT 0,
      status              VARCHAR(20) DEFAULT 'pendente',
      mensagem_template   TEXT,
      delay_segundos      INT DEFAULT 60,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      iniciado_at         TIMESTAMPTZ,
      concluido_at        TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS campanha_destinatarios (
      id            BIGSERIAL PRIMARY KEY,
      campanha_id   BIGINT REFERENCES campanhas(id),
      cnpj          VARCHAR(14),
      status        VARCHAR(20) DEFAULT 'pendente',
      enviado_at    TIMESTAMPTZ,
      erro          TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_dest_campanha ON campanha_destinatarios(campanha_id, status);
  `);
}


// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get("/health", async (req, res) => {
  try {
    const r = await query("SELECT COUNT(*) as total FROM leads WHERE situacao_cadastral=2");
    res.json({
      status: "ok",
      leads_ativos: parseInt(r.rows[0].total),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ status: "erro", error: e.message });
  }
});


// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

(async () => {
  await criarSchemaCampanhas();
  app.listen(PORT, () => {
    console.log(`\n✓ LeadHunter API rodando na porta ${PORT}`);
    console.log(`  GET  /leads/buscar?ddd=11&cnae=5611201&limit=50`);
    console.log(`  GET  /leads/:cnpj?enriquecer=true`);
    console.log(`  GET  /stats/ddd/11`);
    console.log(`  GET  /stats/cnaes`);
    console.log(`  GET  /stats/geral`);
    console.log(`  POST /leads/enriquecer-lote`);
    console.log(`  POST /campanha/criar-lista`);
    console.log(`  GET  /campanha/:id/status\n`);
  });
})();
