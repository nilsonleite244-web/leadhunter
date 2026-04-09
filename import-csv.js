"use strict";
/**
 * LeadHunter — Importador de Leads (Supabase)
 * =============================================
 * Adiciona leads novos ao banco sem afetar clientes nem exigir restart.
 * Detecta duplicados automaticamente por nome+website.
 *
 * USO:
 *   node import-csv.js meu-arquivo.csv
 *   node import-csv.js "C:\Users\Micro\Downloads\leads_novos.csv"
 *
 * FORMATOS SUPORTADOS:
 *   - Apollo.io / Snov.io / Hunter.io
 *   - Planilhas manuais (nome, segmento, telefone, whatsapp, instagram, website)
 *   - Apify / Phantombuster
 *   - Exportações do LinkedIn Sales Navigator
 *   - Formato "Hashtag | Nome | @Instagram | Website"
 */

const fs      = require("fs");
const path    = require("path");
const { parse } = require("csv-parse/sync");
const { Pool }  = require("pg");
require("dotenv").config();

const DB_URL = process.env.DATABASE_URL
  || "postgresql://postgres.jtejlvdwbekqsazibmja:lPqXP4THFSixNRYo@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });

// ── MAPEAMENTO UNIVERSAL DE COLUNAS ──────────────────────────────────────────
const MAP = {
  nome:        ["Company Name","company_name","name","Nome","empresa","Company","business_name","razao_social","nome_fantasia"],
  website:     ["Website","website","site","domain","Domain","Company Website","business_website","business_domain"],
  segmento:    ["Industry","industry","Segmento","segmento","Setor","Category","business_naics_description","cnae_descricao"],
  cidade:      ["City","city","Cidade","cidade","business_city_name","municipio_nome"],
  estado:      ["State","state","Estado","estado","UF","uf","business_region"],
  pais:        ["Country","country","País","pais","business_country_name"],
  funcionarios:["# Employees","Employees","employees","funcionarios","headcount","Employee Count","business_number_of_employees_range"],
  receita:     ["Annual Revenue","Revenue","revenue","receita","Annual Revenue Range","business_yearly_revenue_range"],
  instagram:   ["Instagram","instagram","instagram_url","Instagram URL","instagram_handle","@Instagram"],
  whatsapp:    ["Phone","phone","Phone Number","whatsapp","WhatsApp","telefone","mobile","telefone1"],
  descricao:   ["Short Description","Description","description","descricao","About","Bio","summary","business_business_description"],
};

// ── HELPERS ──────────────────────────────────────────────────────────────────
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && String(row[k]).trim() !== "") return String(row[k]).trim();
    const found = Object.keys(row).find(c => c.toLowerCase().trim() === k.toLowerCase().trim());
    if (found && String(row[found]).trim() !== "") return String(row[found]).trim();
  }
  return null;
}

function normalizeInstagram(val) {
  if (!val) return null;
  val = val.trim();
  const m = val.match(/instagram\.com\/([A-Za-z0-9._]{2,40})/i);
  if (m) return `https://instagram.com/${m[1]}`;
  if (val.startsWith("@")) return `https://instagram.com/${val.slice(1)}`;
  if (/^[A-Za-z0-9._]{2,40}$/.test(val)) return `https://instagram.com/${val}`;
  const m2 = val.match(/@([A-Za-z0-9._]{2,40})/);
  if (m2) return `https://instagram.com/${m2[1]}`;
  return val.startsWith("http") ? val : null;
}

function normalizeWhatsapp(val) {
  if (!val) return null;
  val = val.trim();
  if (val.startsWith("http")) return val;
  const digits = val.replace(/\D/g, "");
  if (!digits) return null;
  const num = digits.startsWith("55") ? digits : "55" + digits;
  return num.length >= 12 ? `https://wa.me/${num}` : null;
}

function normalizeWebsite(val) {
  if (!val) return null;
  const SOCIAL = ["wa.me","whatsapp","instagram.com","facebook.com","linktr.ee","tiktok.com"];
  const clean = val.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");
  return SOCIAL.some(s => clean.includes(s)) ? null : (clean || null);
}

// Detecta formato "Hashtag | Nome | @Instagram | Website" (separado por |)
function parsePipeFormat(raw) {
  const rows = [];
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split("|").map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    // Ignora se for cabeçalho
    if (parts[0].toLowerCase().includes("hashtag") && parts[1].toLowerCase().includes("nome")) continue;
    // Pula partes que são hashtags
    const idx = parts.findIndex(p => !p.startsWith("#"));
    if (idx < 0) continue;
    const nome      = parts[idx]     || null;
    const instagram = parts[idx + 1] || null;
    const website   = parts[idx + 2] || null;
    if (nome) rows.push({ nome, instagram, website });
  }
  return rows;
}

function dupKey(nome, website) {
  return `${(nome||"").toLowerCase().trim()}|${(website||"").toLowerCase().trim()}`;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log("\n📋 USO:  node import-csv.js <arquivo.csv>\n");
    console.log("   Exemplo: node import-csv.js \"C:\\Users\\Micro\\Downloads\\leads_novos.csv\"\n");
    process.exit(0);
  }
  if (!fs.existsSync(file)) {
    console.error(`\n❌ Arquivo não encontrado: ${file}\n`);
    process.exit(1);
  }

  console.log("\n════════════════════════════════════════════");
  console.log(" LeadHunter — Importador de Leads");
  console.log("════════════════════════════════════════════");
  console.log(`📂 Arquivo: ${path.basename(file)}`);

  const raw = fs.readFileSync(file, "utf-8");
  let csvRows = [];
  let isPipe = false;

  // Tenta detectar formato pipe (|)
  const firstLine = raw.split(/\r?\n/)[0] || "";
  if (firstLine.includes("|") && !firstLine.includes(",")) {
    isPipe = true;
    const pipeRows = parsePipeFormat(raw);
    console.log(`📊 Formato detectado: Hashtag | Nome | @Instagram | Website`);
    csvRows = pipeRows.map(r => ({ ...r }));
  } else {
    // CSV normal
    const delimiter = firstLine.includes(";") ? ";" : ",";
    csvRows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter });
    console.log(`📊 Formato detectado: CSV (separador: "${delimiter}")`);
  }

  console.log(`   ${csvRows.length} linhas encontradas`);
  if (csvRows.length > 0 && !isPipe) {
    console.log(`   Colunas: ${Object.keys(csvRows[0]).slice(0,6).join(", ")}...`);
  }

  // ── Carrega duplicados existentes em memória (1 query) ──────────────────────
  console.log("\n🔍 Carregando registros existentes para detecção de duplicados...");
  const client = await pool.connect();
  const existingRes = await client.query("SELECT nome, website FROM leads_extra");
  const existing = new Set(existingRes.rows.map(r => dupKey(r.nome, r.website)));
  const totalAntes = existingRes.rows.length;
  console.log(`   ${totalAntes.toLocaleString("pt-BR")} leads já cadastrados`);

  // ── Processa CSV ──────────────────────────────────────────────────────────
  const toInsert = [];
  let ignorados = 0;

  for (const row of csvRows) {
    const nome    = isPipe ? (row.nome || null) : pick(row, MAP.nome);
    if (!nome || nome.length < 2) { ignorados++; continue; }

    const website   = normalizeWebsite(isPipe ? (row.website || null) : pick(row, MAP.website));
    const instagram = normalizeInstagram(isPipe ? (row.instagram || null) : pick(row, MAP.instagram));
    const rawWpp    = isPipe ? null : pick(row, MAP.whatsapp);
    const whatsapp  = normalizeWhatsapp(rawWpp);
    const segmento  = pick(row, MAP.segmento);
    const cidade    = pick(row, MAP.cidade);
    const estado    = pick(row, MAP.estado);
    const pais      = pick(row, MAP.pais) || "Brasil";
    const funcs     = pick(row, MAP.funcionarios);
    const receita   = pick(row, MAP.receita);
    const descricao = pick(row, MAP.descricao);

    // Verifica duplicado em memória
    const key = dupKey(nome, website);
    if (existing.has(key)) { ignorados++; continue; }
    existing.add(key); // evita duplicados dentro do próprio CSV

    toInsert.push([nome, website, segmento, cidade, estado, pais, funcs, receita, instagram, whatsapp, descricao]);
  }

  console.log(`\n📋 Novos leads para inserir: ${toInsert.length.toLocaleString("pt-BR")}`);
  console.log(`   Duplicados ignorados: ${ignorados.toLocaleString("pt-BR")}`);

  if (toInsert.length === 0) {
    console.log("\n✅ Nada a importar — todos os leads já estão cadastrados.\n");
    client.release(); await pool.end(); return;
  }

  // ── Insere em batches de 500 ───────────────────────────────────────────────
  const BATCH = 500;
  let inseridos = 0;
  console.log("\n⬆️  Importando...");

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const values = batch.map((_, idx) => {
      const base = idx * 11;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},NOW())`;
    }).join(",");
    const flat = batch.flat();
    await client.query(
      `INSERT INTO leads_extra (nome,website,segmento,cidade,estado,pais,funcionarios,receita,instagram,whatsapp,descricao,created_at) VALUES ${values}`,
      flat
    );
    inseridos += batch.length;
    process.stdout.write(`\r   ${inseridos}/${toInsert.length} inseridos...`);
  }

  client.release();
  await pool.end();

  // Total final
  const pool2 = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  const countRes = await pool2.query("SELECT COUNT(*) FROM leads_extra");
  const totalDepois = parseInt(countRes.rows[0].count);
  await pool2.end();

  console.log(`\n\n════════════════════════════════════════════`);
  console.log(` ✅ Importação concluída!`);
  console.log(`════════════════════════════════════════════`);
  console.log(` Leads inseridos agora:  ${inseridos.toLocaleString("pt-BR")}`);
  console.log(` Duplicados ignorados:   ${ignorados.toLocaleString("pt-BR")}`);
  console.log(` Total no banco antes:   ${totalAntes.toLocaleString("pt-BR")}`);
  console.log(` Total no banco agora:   ${totalDepois.toLocaleString("pt-BR")}`);
  console.log(`\n Os novos leads já estão disponíveis no app.`);
  console.log(` Nenhum restart necessário. ✓\n`);
}

main().catch(e => {
  console.error("\n❌ Erro fatal:", e.message);
  process.exit(1);
});
