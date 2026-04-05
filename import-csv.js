"use strict";
/**
 * LeadHunter — Importador Universal de CSV
 * ==========================================
 * Suporta exports de: Apollo.io, Snov.io, Hunter.io, LinkedIn Sales Navigator,
 *                     Phantombuster, Apify, planilhas manuais.
 *
 * USO:
 *   node import-csv.js caminho/para/arquivo.csv
 *
 * Instalar dependências (uma vez):
 *   npm install csv-parse dotenv pg
 */

const fs      = require("fs");
const path    = require("path");
const { parse } = require("csv-parse/sync");
const { Pool }  = require("pg");
require("dotenv").config();

// ── MAPEAMENTO DE COLUNAS ────────────────────────────────────────────────────
// Coloque aqui todos os nomes de colunas possíveis (case-insensitive) de cada campo.
// O script pega o primeiro que encontrar no CSV.
const MAP = {
  nome:        ["Company Name", "company_name", "name", "Nome", "empresa", "Company"],
  website:     ["Website", "website", "site", "domain", "Domain", "Company Website"],
  segmento:    ["Industry", "industry", "Segmento", "segmento", "Setor", "Category"],
  cidade:      ["City", "city", "Cidade", "cidade"],
  estado:      ["State", "state", "Estado", "estado", "UF", "uf"],
  pais:        ["Country", "country", "País", "pais"],
  funcionarios:["# Employees", "Employees", "employees", "funcionarios", "headcount", "Employee Count"],
  receita:     ["Annual Revenue", "Revenue", "revenue", "receita", "Annual Revenue Range"],
  instagram:   ["Instagram", "instagram", "instagram_url", "Instagram URL", "instagram_handle"],
  whatsapp:    ["Phone", "phone", "Phone Number", "whatsapp", "WhatsApp", "telefone", "mobile"],
  descricao:   ["Short Description", "Description", "description", "descricao", "About", "Bio", "summary"],
};

// ── DB ───────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── HELPERS ─────────────────────────────────────────────────────────────────
function pick(row, keys) {
  for (const k of keys) {
    // busca exato, depois case-insensitive
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return String(row[k]).trim();
    const found = Object.keys(row).find(c => c.toLowerCase() === k.toLowerCase());
    if (found && String(row[found]).trim() !== "") return String(row[found]).trim();
  }
  return null;
}

function normalizeInstagram(val) {
  if (!val) return null;
  val = val.trim();
  // Se for URL completa, extrai o handle
  const m = val.match(/instagram\.com\/([A-Za-z0-9._]{2,40})/i);
  if (m) return m[1];
  // Se for @handle
  if (val.startsWith("@")) return val.slice(1);
  // Se parecer um handle simples (sem espaços)
  if (/^[A-Za-z0-9._]{2,40}$/.test(val)) return val;
  // Se for texto longo com menção ao Instagram
  const m2 = val.match(/(?:instagram\.com\/|@)([A-Za-z0-9._]{2,40})/i);
  if (m2) return m2[1];
  return val; // guarda como está
}

function normalizeWebsite(val) {
  if (!val) return null;
  val = val.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  return val || null;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: node import-csv.js <arquivo.csv>");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`Arquivo não encontrado: ${file}`);
    process.exit(1);
  }

  console.log(`\n📂 Lendo ${path.basename(file)}...`);
  const raw  = fs.readFileSync(file, "utf-8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  console.log(`   ${rows.length} linhas encontradas`);

  // Mostra colunas do CSV para diagnóstico
  if (rows.length > 0) {
    console.log(`   Colunas: ${Object.keys(rows[0]).join(", ")}\n`);
  }

  let inseridos = 0, ignorados = 0, erros = 0;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const row of rows) {
      const nome    = pick(row, MAP.nome);
      const website = normalizeWebsite(pick(row, MAP.website));

      if (!nome) { ignorados++; continue; }

      const instagram = normalizeInstagram(pick(row, MAP.instagram));
      const whatsapp  = pick(row, MAP.whatsapp);
      const segmento  = pick(row, MAP.segmento);
      const cidade    = pick(row, MAP.cidade);
      const estado    = pick(row, MAP.estado);
      const pais      = pick(row, MAP.pais) || "Brasil";
      const funcs     = pick(row, MAP.funcionarios);
      const receita   = pick(row, MAP.receita);
      const descricao = pick(row, MAP.descricao);

      // Upsert: se já existir (mesmo nome + website), atualiza; senão, insere
      const upsertSql = `
        INSERT INTO leads_extra
          (nome, website, segmento, cidade, estado, pais, funcionarios, receita, instagram, whatsapp, descricao, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
        ON CONFLICT DO NOTHING
      `;
      // leads_extra não tem unique constraint por padrão; verificamos manualmente
      const existsRes = await client.query(
        "SELECT id FROM leads_extra WHERE nome = $1 AND (website = $2 OR (website IS NULL AND $2 IS NULL)) LIMIT 1",
        [nome, website]
      );

      if (existsRes.rows.length > 0) {
        // Atualiza campos em branco com novos dados
        await client.query(`
          UPDATE leads_extra SET
            instagram   = COALESCE(NULLIF(instagram,''),  $2),
            whatsapp    = COALESCE(NULLIF(whatsapp,''),   $3),
            website     = COALESCE(NULLIF(website,''),    $4),
            segmento    = COALESCE(NULLIF(segmento,''),   $5),
            cidade      = COALESCE(NULLIF(cidade,''),     $6),
            estado      = COALESCE(NULLIF(estado,''),     $7),
            funcionarios= COALESCE(NULLIF(funcionarios,''),$8),
            receita     = COALESCE(NULLIF(receita,''),    $9),
            descricao   = COALESCE(NULLIF(descricao,''),  $10)
          WHERE id = $1
        `, [existsRes.rows[0].id, instagram, whatsapp, website, segmento, cidade, estado, funcs, receita, descricao]);
        ignorados++;
      } else {
        await client.query(upsertSql, [nome, website, segmento, cidade, estado, pais, funcs, receita, instagram, whatsapp, descricao]);
        inseridos++;
      }
    }

    await client.query("COMMIT");
  } catch(e) {
    await client.query("ROLLBACK");
    console.error("Erro durante importação:", e.message);
    erros++;
  } finally {
    client.release();
  }

  await pool.end();
  console.log(`\n✅ Importação concluída:`);
  console.log(`   ${inseridos} leads novos inseridos`);
  console.log(`   ${ignorados} duplicados atualizados/ignorados`);
  if (erros) console.log(`   ${erros} erros`);
  console.log(`\n   Abra o LeadHunter e clique em "Buscar Leads com Instagram" para ver os novos leads.\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
