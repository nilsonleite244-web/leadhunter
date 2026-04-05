"use strict";
/**
 * LeadHunter — Scraper Instagram
 * ================================
 * Usa o Chrome instalado no seu PC com sua sessão já logada.
 * Busca hashtags de negócios brasileiros e alimenta o banco automaticamente.
 *
 * USO:
 *   node scraper-instagram.js
 *
 * REQUISITOS:
 *   - Google Chrome instalado
 *   - Estar logado no Instagram no Chrome
 *   - node scraper-instagram.js (roda em segundo plano)
 */

const puppeteer = require("puppeteer");
const { Pool }  = require("pg");
const fs        = require("fs");
require("dotenv").config();

// ── CONFIG ────────────────────────────────────────────────────────────────────

// Hashtags para buscar — adicione quantas quiser
const HASHTAGS = [
  "barbearia", "barberashop", "barbeirosbrasil",
  "clinicaestetica", "esteticafacial", "esteticacorporal",
  "petshop", "petshopbrasil", "clinicaveterinaria",
  "academia", "crossfit", "pilates",
  "restaurante", "hamburgueria", "pizzaria",
  "advogado", "escritoriodeadvocacia",
  "contabilidade", "escritoriocontabil",
  "imobiliaria", "corretordeimoveis",
  "odontologia", "clinicaodontologica",
  "psicologia", "psicologobrasil",
  "nutricionista", "nutricao",
  "arquitetura", "decoracao",
  "marketing", "agenciadigital",
  "moda", "lojaroupas",
  "joalheria", "joia",
  "autoescola", "cfc",
  "farmacia", "drogaria",
  "supermercado", "mercadinho",
];

// Perfis por hashtag (quanto mais, mais leads — mas mais lento)
const PERFIS_POR_HASHTAG = 30;

// Delay entre ações (ms) — não coloque menos de 2000 para evitar ban
const DELAY_MIN = 2500;
const DELAY_MAX = 5000;

// Arquivo de progresso (para poder pausar e continuar)
const PROGRESS_FILE = "./scraper-progress.json";

// Caminho do Chrome — ajuste se necessário
const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.CHROME_PATH,
].filter(Boolean);

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand  = (min, max) => Math.floor(Math.random() * (max - min)) + min;
const delay = () => sleep(rand(DELAY_MIN, DELAY_MAX));

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8")); }
  catch { return { hashtagsDone: [], handlesSeen: [] }; }
}

function saveProgress(prog) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(prog, null, 2));
}

async function salvarLead(data) {
  const { nome, handle, bio, website, cidade, estado, segmento } = data;
  if (!handle) return false;

  // Monta o campo instagram com o handle
  const igVal = handle.startsWith("@") ? handle : "@" + handle;

  try {
    const existing = await pool.query(
      "SELECT id FROM leads_extra WHERE instagram = $1 OR instagram ILIKE $2 LIMIT 1",
      [igVal, "%" + handle + "%"]
    );
    if (existing.rows.length > 0) {
      // Atualiza dados faltantes
      await pool.query(`
        UPDATE leads_extra SET
          nome     = COALESCE(NULLIF(nome,''),    $2),
          website  = COALESCE(NULLIF(website,''), $3),
          cidade   = COALESCE(NULLIF(cidade,''),  $4),
          estado   = COALESCE(NULLIF(estado,''),  $5),
          descricao= COALESCE(NULLIF(descricao,''),$6)
        WHERE id = $1
      `, [existing.rows[0].id, nome, website, cidade, estado, bio]);
      return false; // já existia
    }

    await pool.query(`
      INSERT INTO leads_extra
        (nome, instagram, website, descricao, segmento, cidade, estado, pais, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'Brasil',NOW())
    `, [nome || handle, igVal, website || null, bio || null, segmento || null, cidade || null, estado || null]);
    return true; // novo
  } catch(e) {
    console.error("  ⚠ Erro ao salvar:", e.message);
    return false;
  }
}

// ── EXTRAI DADOS DO PERFIL ────────────────────────────────────────────────────
async function extrairPerfil(page, handle) {
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, {
      waitUntil: "domcontentloaded", timeout: 15000
    });
    await sleep(rand(1500, 2500));

    const data = await page.evaluate(() => {
      const getMeta = (prop) => {
        const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
        return el ? el.getAttribute("content") : null;
      };

      // Nome
      const nome = document.querySelector("h2")?.textContent?.trim()
        || document.querySelector("header h1")?.textContent?.trim()
        || getMeta("og:title")?.replace(" • Instagram", "").trim()
        || null;

      // Bio
      const bio = getMeta("og:description")
        || document.querySelector("header section div span")?.textContent?.trim()
        || null;

      // Website (link externo na bio)
      const websiteEl = document.querySelector("a[rel='me nofollow noopener noreferrer']")
        || document.querySelector("header a[href^='http']:not([href*='instagram.com'])");
      const website = websiteEl?.href || null;

      // Localização (se disponível)
      const locEl = Array.from(document.querySelectorAll("header span, header div"))
        .find(el => el.textContent.match(/,\s*[A-Z]{2}$|São Paulo|Rio de Janeiro|Minas|Paraná/i));
      const loc = locEl?.textContent?.trim() || null;

      // Categoria (abaixo do nome em alguns perfis)
      const catEl = document.querySelector("header section > div:nth-child(2) span");
      const categoria = catEl?.textContent?.trim() || null;

      return { nome, bio, website, loc, categoria };
    });

    // Parseia cidade/estado da localização
    let cidade = null, estado = null;
    if (data.loc) {
      const parts = data.loc.split(",").map(s => s.trim());
      if (parts.length >= 2) { cidade = parts[0]; estado = parts[parts.length - 1]; }
      else cidade = parts[0];
    }

    return { ...data, cidade, estado };
  } catch(e) {
    return null;
  }
}

// ── BUSCA HANDLES POR HASHTAG ─────────────────────────────────────────────────
async function buscarHandlesPorHashtag(page, hashtag) {
  const handles = new Set();
  try {
    await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, {
      waitUntil: "domcontentloaded", timeout: 20000
    });
    await sleep(rand(2000, 3500));

    // Rola a página para carregar mais posts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await sleep(rand(1500, 2500));
    }

    // Coleta links de posts
    const postLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll("article a[href*='/p/']"))
        .map(a => a.href)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 40)
    );

    // Entra em cada post e pega o handle do autor
    for (const postUrl of postLinks.slice(0, PERFIS_POR_HASHTAG)) {
      try {
        await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
        await sleep(rand(1000, 2000));

        const handle = await page.evaluate(() => {
          const a = document.querySelector("article header a[href^='/']:not([href*='/p/'])");
          if (a) return a.href.replace(/.*instagram\.com\//, "").replace(/\/$/, "");
          const m = window.location.href.match(/instagram\.com\/p\/[^/]+\//);
          return null;
        });

        if (handle && handle.length > 1 && !handle.includes("/")) {
          handles.add(handle);
        }

        if (handles.size >= PERFIS_POR_HASHTAG) break;
      } catch { continue; }

      await delay();
    }
  } catch(e) {
    console.error(`  ⚠ Erro na hashtag #${hashtag}:`, e.message);
  }

  return [...handles];
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║  LeadHunter — Scraper Instagram          ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Encontra o Chrome
  const chromePath = CHROME_PATHS.find(p => fs.existsSync(p));
  if (!chromePath) {
    console.error("❌ Chrome não encontrado. Defina CHROME_PATH no .env");
    process.exit(1);
  }
  console.log(`🌐 Chrome: ${chromePath}`);

  // Carrega progresso anterior
  const progress = loadProgress();
  console.log(`📊 Progresso anterior: ${progress.hashtagsDone.length} hashtags concluídas, ${progress.handlesSeen.length} perfis vistos\n`);

  // Abre o Chrome COM seu perfil (já logado no Instagram)
  const userDataDir = process.env.CHROME_USER_DATA
    || `C:\\Users\\${require("os").userInfo().username}\\AppData\\Local\\Google\\Chrome\\User Data`;

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    userDataDir,           // usa seu perfil existente = já logado
    headless: false,       // visível para você acompanhar
    defaultViewport: null,
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Verifica se está logado
  console.log("🔍 Verificando sessão do Instagram...");
  await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
  await sleep(3000);

  const logado = await page.evaluate(() =>
    !document.querySelector("input[name='username']") &&
    (document.querySelector("svg[aria-label='Home']") !== null ||
     document.querySelector("a[href='/direct/inbox/']") !== null ||
     document.title.includes("Instagram"))
  );

  if (!logado) {
    console.log("⚠  Não está logado. O Chrome vai abrir — faça login manualmente e pressione ENTER aqui.");
    await new Promise(r => process.stdin.once("data", r));
  } else {
    console.log("✅ Logado no Instagram!\n");
  }

  let totalNovos = 0;
  const hashtagsRestantes = HASHTAGS.filter(h => !progress.hashtagsDone.includes(h));
  console.log(`🏷  ${hashtagsRestantes.length} hashtags para processar\n`);

  for (const hashtag of hashtagsRestantes) {
    console.log(`\n🔎 #${hashtag}`);
    const handles = await buscarHandlesPorHashtag(page, hashtag);
    const novosHandles = handles.filter(h => !progress.handlesSeen.includes(h));
    console.log(`   ${handles.length} perfis encontrados, ${novosHandles.length} novos`);

    let novosNestaHashtag = 0;
    for (const handle of novosHandles) {
      process.stdout.write(`   @${handle} → `);
      progress.handlesSeen.push(handle);

      const perfil = await extrairPerfil(page, handle);
      if (!perfil) { console.log("falhou"); continue; }

      const salvo = await salvarLead({
        nome:     perfil.nome,
        handle,
        bio:      perfil.bio,
        website:  perfil.website,
        cidade:   perfil.cidade,
        estado:   perfil.estado,
        segmento: hashtag,
      });

      if (salvo) {
        novosNestaHashtag++;
        totalNovos++;
        console.log(`✅ ${perfil.nome || handle}${perfil.website ? " | " + perfil.website : ""}`);
      } else {
        console.log("já existe");
      }

      saveProgress(progress);
      await delay();
    }

    progress.hashtagsDone.push(hashtag);
    saveProgress(progress);
    console.log(`   ✔ #${hashtag} concluída — ${novosNestaHashtag} leads novos`);

    // Pausa maior entre hashtags
    await sleep(rand(4000, 8000));
  }

  await browser.close();
  await pool.end();

  console.log(`\n✅ Scraping concluído! ${totalNovos} leads novos adicionados ao banco.`);
  console.log(`   Abra o LeadHunter e clique em "Buscar Leads com Instagram".\n`);
}

main().catch(e => {
  console.error("Erro fatal:", e.message);
  process.exit(1);
});
