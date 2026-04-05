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
const total = parseInt(r1.rows[0].count) + parseInt(r2.rows[0].count);  family: 4,
});
const total = parseInt(r1.rows[0].count) + count2;app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(rateLimit({ windowMs: 60000, max: 300, message: { error: "Muitas requisicoes" } }));
const query = (sql, params) => pool.query(sql, params);
function paginate(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, Math.max(10, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
app.get("/health", async (req, res) => {
  try {
    const r1 = await query("SELECT COUNT(*) as count FROM leads");
    const r2 = await pool.query("SELECT COUNT(*) as count FROM leads_extra").catch(() => ({ rows: [{ count: '0' }] }));
    const total = parseInt(r1.rows[0].count) + parseInt(r2.rows[0].count);
    res.json({ status: "ok", leads_ativos: total, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: "erro", error: e.message });
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
      const extraRes = await query("SELECT nome as razao_social, nome as nome_fantasia, segmento as cnae_descricao, telefone as telefone1, whatsapp_url, instagram_url, endereco as logradouro, status FROM leads_extra LIMIT $1", [limit]);
      extraRows = extraRes.rows;
    } catch(e) {}
    const allLeads = [...dataRes.rows, ...extraRows];
    res.json({ total: total + extraRows.length, page, limit, pages: Math.ceil(total / limit), data: allLeads.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/leads/:cnpj", async (req, res) => {
  try {
    const cnpj = req.params.cnpj.replace(/\D/g, "").padStart(14, "0");
    let local = await query("SELECT * FROM leads WHERE cnpj = $1", [cnpj]);
    if (!local.rows.length) {
      try { local = await query("SELECT * FROM leads_extra WHERE cnpj = $1", [cnpj]); } catch(e) {}
    }
    if (!local.rows.length) return res.status(404).json({ error: "CNPJ nao encontrado" });
    res.json(local.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
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
    res.json({ total_cnpjs: parseInt(total.rows[0].count), empresas_ativas: parseInt(ativos.rows[0].count), com_email: parseInt(comEmail.rows[0].count), com_telefone: parseInt(comTel.rows[0].count), por_porte: porPorte.rows, top_ufs: porUF.rows });
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
    const where = ddd ? "WHERE l.ddd_municipio = '" + ddd + "' AND l.situacao_cadastral = 2" : "WHERE l.situacao_cadastral = 2";
    const result = await query("SELECT c.descricao as segmento, COUNT(l.cnpj) as total FROM leads l JOIN cnaes c ON c.codigo = l.cnae_principal " + where + " GROUP BY c.descricao ORDER BY total DESC LIMIT 20");
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
    const rows = cnpjs.map(cnpj => "(" + campanha_id + ", '" + cnpj.replace(/\D/g,"").padStart(14,"0") + "', 'pendente')");
    for (let i = 0; i < rows.length; i += 500) {
      await query("INSERT INTO campanha_destinatarios (campanha_id, cnpj, status) VALUES " + rows.slice(i, i+500).join(","));
    }
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
async function criarSchema() {
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS campanhas (id BIGSERIAL PRIMARY KEY, nome VARCHAR(200), canal VARCHAR(20), total INT, enviados INT DEFAULT 0, status VARCHAR(20) DEFAULT 'pendente', mensagem_template TEXT, delay_segundos INT DEFAULT 60, created_at TIMESTAMPTZ DEFAULT NOW(), iniciado_at TIMESTAMPTZ, concluido_at TIMESTAMPTZ)");
    await pool.query("CREATE TABLE IF NOT EXISTS campanha_destinatarios (id BIGSERIAL PRIMARY KEY, campanha_id BIGINT REFERENCES campanhas(id), cnpj VARCHAR(14), status VARCHAR(20) DEFAULT 'pendente', enviado_at TIMESTAMPTZ, erro TEXT)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_dest_campanha ON campanha_destinatarios(campanha_id, status)");
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
      if (tentativas >= 5) { console.error("Nao foi possivel conectar."); process.exit(1); }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  await criarSchema();
  app.listen(PORT, "0.0.0.0", () => { console.log("LeadHunter API rodando na porta " + PORT); });
})();
