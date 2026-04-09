"use strict";
/**
 * LeadHunter — Importador Firebase
 * ===================================
 * Importa CSVs e seed de leads para o Firestore.
 *
 * USO:
 *   node firebase-import.js                            → importa seed (75 leads)
 *   node firebase-import.js caminho/arquivo.csv        → importa CSV
 *   node firebase-import.js --seed                     → só seed
 */

const fs      = require("fs");
const path    = require("path");
const admin   = require("firebase-admin");
const { parse } = require("csv-parse/sync");
require("dotenv").config();

// ── FIREBASE ──────────────────────────────────────────────────────────────────
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  credential = admin.credential.cert(require("./firebase-service-account.json"));
}
admin.initializeApp({ credential });
const db = admin.firestore();

// ── HELPERS ───────────────────────────────────────────────────────────────────
const SOCIAL_DOMAINS = ["wa.me","whatsapp","instagram.com","facebook.com","linktr.ee","tiktok.com","youtube.com","bio.site","hotmart","kirvano","appbarber","belasis.app"];

function hasOwnWebsite(website) {
  if (!website) return false;
  const w = website.toLowerCase();
  return !SOCIAL_DOMAINS.some(d => w.includes(d));
}

function normalizeHandle(val) {
  if (!val) return null;
  val = val.trim();
  const m = val.match(/instagram\.com\/([A-Za-z0-9._]{2,40})/i);
  if (m) return m[1];
  if (val.startsWith("@")) return val.slice(1);
  if (/^[A-Za-z0-9._]{2,40}$/.test(val)) return val;
  const m2 = val.match(/@([A-Za-z0-9._]{2,40})/);
  if (m2) return m2[1];
  return null;
}

function normalizeWebsite(val) {
  if (!val) return null;
  val = val.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return val || null;
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && String(row[k]).trim() !== "") return String(row[k]).trim();
    const found = Object.keys(row).find(c => c.toLowerCase() === k.toLowerCase());
    if (found && String(row[found]).trim() !== "") return String(row[found]).trim();
  }
  return null;
}

const COL_MAP = {
  nome:         ["Company Name","company_name","name","Nome","empresa","Company"],
  website:      ["Website","website","site","domain","Domain","Company Website"],
  segmento:     ["Industry","industry","Segmento","segmento","Setor","Category"],
  cidade:       ["City","city","Cidade","cidade"],
  estado:       ["State","state","Estado","estado","UF","uf"],
  pais:         ["Country","country","País","pais"],
  funcionarios: ["# Employees","Employees","employees","funcionarios","headcount","Employee Count"],
  receita:      ["Annual Revenue","Revenue","revenue","receita","Annual Revenue Range"],
  instagram:    ["Instagram","instagram","instagram_url","Instagram URL","instagram_handle"],
  whatsapp:     ["Phone","phone","Phone Number","whatsapp","WhatsApp","telefone","mobile"],
  descricao:    ["Short Description","Description","description","descricao","About","Bio","summary"],
};

function csvRowToDoc(row) {
  const nome     = pick(row, COL_MAP.nome);
  if (!nome) return null;

  const website     = normalizeWebsite(pick(row, COL_MAP.website));
  const igRaw       = pick(row, COL_MAP.instagram);
  const handle      = normalizeHandle(igRaw);
  const whatsapp    = pick(row, COL_MAP.whatsapp);
  const segmento    = (pick(row, COL_MAP.segmento) || "").toLowerCase() || null;
  const cidade      = (pick(row, COL_MAP.cidade) || "").toLowerCase() || null;
  const estado      = pick(row, COL_MAP.estado)?.toUpperCase() || null;
  const pais        = pick(row, COL_MAP.pais) || "Brasil";
  const funcionarios = pick(row, COL_MAP.funcionarios);
  const receita     = pick(row, COL_MAP.receita);
  const descricao   = pick(row, COL_MAP.descricao);

  return {
    nome,
    nome_lower:        nome.toLowerCase(),
    website:           website || null,
    has_own_website:   hasOwnWebsite(website),
    instagram:         handle ? "@" + handle : (igRaw || null),
    instagram_handle:  handle || null,
    has_instagram:     !!handle,
    whatsapp:          whatsapp || null,
    segmento:          segmento || null,
    cidade:            cidade   || null,
    estado:            estado   || null,
    pais,
    funcionarios:      funcionarios || null,
    receita:           receita      || null,
    descricao:         descricao    || null,
    created_at:        admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ── SEED DATA ─────────────────────────────────────────────────────────────────
const SEED_LEADS = [
  { segmento:"barbearia",       nome:"Studio Prado Barber",          handle:"studiopradobarber_",      website:"wa.me/message/E7BSQCGSZZVQK1" },
  { segmento:"clinicaestetica", nome:"Dra. Elvira Morgado",          handle:"dra.elviramorgado",        website:"www.skintime.es" },
  { segmento:"petshop",         nome:"Vila Pet",                     handle:"vilapet_petshop",          website:"wa.me/5561995189438" },
  { segmento:"academia",        nome:"JR Guedes João XXIII",         handle:"academiajrguedes",         website:"bio.site/jrguedes" },
  { segmento:"barbearia",       nome:"Barbearia Conceito",           handle:"_barbeariaconceito_",      website:"sites.appbarber.com.br/links/Barbeariconceito" },
  { segmento:"petshop",         nome:"Filhos de Patas Agropet",      handle:"filhosdepatasagropet",     website:"linktr.ee/filhosdepatasagropet" },
  { segmento:"barbearia",       nome:"Barbearia The Brother's",      handle:"barbeariathebrothers2",    website:"wa.me/5548996424572" },
  { segmento:"barbearia",       nome:"Marcos Fade",                  handle:"marcos.fade",              website:"linktr.ee/marcos.fade" },
  { segmento:"barbearia",       nome:"Barber Elite",                 handle:"barberelite",              website:"barberelite.com.br" },
  { segmento:"barbearia",       nome:"Studio Barba",                 handle:"studiobarba",              website:"studiobarba.belasis.app" },
  { segmento:"barbearia",       nome:"Barbearia Kings",              handle:"barbeariakings",           website:"wa.me/5588999887766" },
  { segmento:"petshop",         nome:"Mundo Pet",                    handle:"mundopet",                 website:"mundopet.com.br" },
  { segmento:"petshop",         nome:"Pet Care Center",              handle:"petcarecenter",            website:"linktr.ee/petcarecenter" },
  { segmento:"petshop",         nome:"Pet Max Shop",                 handle:"petmaxshop",               website:"petmaxshop.belasis.app" },
  { segmento:"petshop",         nome:"Loja Pet Premium",             handle:"lojapetpremium",           website:"lojapetpremium.com.br" },
  { segmento:"academia",        nome:"Academia Fit Life",            handle:"academiafit_life",         website:"fitlife.belasis.app" },
  { segmento:"academia",        nome:"Academia PowerGym",            handle:"powergymacademia",         website:"powergymacademia.com.br" },
  { segmento:"academia",        nome:"Studio Musculação",            handle:"studiomusc",               website:"linktr.ee/studiomusculacao" },
  { segmento:"academia",        nome:"Academia Shape",               handle:"academiashape",            website:"wa.me/5586777888999" },
  { segmento:"academia",        nome:"Ginásio Força Total",          handle:"gimnasiofortotal",         website:"forcatotal.com.br" },
  { segmento:"clinicaestetica", nome:"Clínica Beleza Total",         handle:"clinicabeletatotal",       website:"clinicabeletatotal.com.br" },
  { segmento:"clinicaestetica", nome:"Estética & Wellness",          handle:"esteticawellness",         website:"esteticawellness.com.br" },
  { segmento:"clinicaestetica", nome:"Centro Estético Premium",      handle:"centroestpremium",         website:"linktr.ee/centroestpremium" },
  { segmento:"clinicaestetica", nome:"Clínica Derma Beauty",         handle:"clinicadermabe",           website:"dermabeuty.belasis.app" },
  { segmento:"clinicaestetica", nome:"Spa & Estética",               handle:"spaestetica",              website:"wa.me/5581555444333" },
  { segmento:"barbearia",       nome:"Nobres Barbershop Planalto",   handle:"nobresbarbershop_planalto",website:"wa.me/5531989224374" },
  { segmento:"barbearia",       nome:"Estação Barba",                handle:"estacaobarba",             website:"linktr.ee/estacaobarba" },
  { segmento:"barbearia",       nome:"Black Barber Studio",          handle:"blackbarberstudio",        website:"blackbarber.belasis.app" },
  { segmento:"barbearia",       nome:"Barbearia Nova Era",           handle:"barbearianovaera",         website:"novaera.com.br" },
  { segmento:"barbearia",       nome:"Master Cut Barbershop",        handle:"mastercutbarber",          website:"mastercutbarber.com.br" },
  { segmento:"petshop",         nome:"PetWorld Paradise",            handle:"petworldparadise",         website:"petworldparadise.com.br" },
  { segmento:"petshop",         nome:"Animal Planet Petshop",        handle:"animalplanetpet",          website:"wa.me/5589888777666" },
  { segmento:"petshop",         nome:"Royal Pet Shop",               handle:"royalpetshop",             website:"royalpet.belasis.app" },
  { segmento:"petshop",         nome:"Peludos & Cia",                handle:"peludosecia",              website:"linktr.ee/peludosecia" },
  { segmento:"petshop",         nome:"Pet Shop Meu Bichinho",        handle:"meubichinho",              website:"meubichinho.com.br" },
  { segmento:"academia",        nome:"Power Iron Gym",               handle:"powerirongym",             website:"powerirungym.com.br" },
  { segmento:"academia",        nome:"Musculação Elite",             handle:"musculacaoelit",           website:"linktr.ee/musculacaoelit" },
  { segmento:"academia",        nome:"Fitness Planet",               handle:"fitnessplanet",            website:"fitnesplanet.belasis.app" },
  { segmento:"academia",        nome:"Spartans Gym",                 handle:"spartansgym",              website:"spartansgym.com.br" },
  { segmento:"academia",        nome:"Iron Paradise",                handle:"ironparadise",             website:"ironparadise.com.br" },
  { segmento:"clinicaestetica", nome:"Clínica Transformação",        handle:"clinicatransf",            website:"clinicatransformacao.com.br" },
  { segmento:"clinicaestetica", nome:"Beleza Única Estética",        handle:"belezaunica",              website:"linktr.ee/belezaunica" },
  { segmento:"clinicaestetica", nome:"Glow Aesthetic Clinic",        handle:"glowesthetic",             website:"glowclinic.belasis.app" },
  { segmento:"clinicaestetica", nome:"Rejuvenescimento Total",       handle:"rejuvenescimento",         website:"wa.me/5583333222111" },
  { segmento:"clinicaestetica", nome:"Estética Moderna",             handle:"esteticamoderna",          website:"esteticamoderna.com.br" },
  { segmento:"barbearia",       nome:"Barbearia Aristocrata",        handle:"barbeariaristaocrata",     website:"linktr.ee/aristocrata" },
  { segmento:"barbearia",       nome:"Barber Angels",                handle:"barberangels",             website:"baberanger.com.br" },
  { segmento:"barbearia",       nome:"Corte Fino Barber",            handle:"cortefino",                website:"cortefino.belasis.app" },
  { segmento:"barbearia",       nome:"Barbearia Original",          handle:"barbeariaoriginal",         website:"barbeariaoriginal.com.br" },
  { segmento:"petshop",         nome:"Pet's House",                  handle:"petshouse",                website:"petshouse.com.br" },
  { segmento:"petshop",         nome:"PetLand Express",              handle:"petlandexpress",           website:"petlandexpress.belasis.app" },
  { segmento:"petshop",         nome:"Planeta Animal",               handle:"planetaanimal",            website:"planetaanimal.com.br" },
  { segmento:"academia",        nome:"Titan Strength",               handle:"titanstrenght",            website:"titanstrenght.com.br" },
  { segmento:"academia",        nome:"Valhala Gym",                  handle:"valhalagym",               website:"valhalagym.belasis.app" },
  { segmento:"academia",        nome:"Ultimate Fitness",             handle:"ultimatefitness",          website:"wa.me/5580999888777" },
  { segmento:"academia",        nome:"Força Total",                  handle:"forcatotalacad",           website:"forcatotal.com.br" },
  { segmento:"clinicaestetica", nome:"Renascimento Estético",        handle:"renascimentoest",          website:"renascimento.com.br" },
  { segmento:"clinicaestetica", nome:"Harmonia Beauty",              handle:"harmoniabeauty",           website:"harmoniabeauty.belasis.app" },
  { segmento:"clinicaestetica", nome:"Radiance Clinic",              handle:"radianceclinic",           website:"wa.me/5579888777666" },
  { segmento:"barbearia",       nome:"Barbearia Retrô",              handle:"barbeariaretr",            website:"linktr.ee/barbeariaretr" },
  { segmento:"barbearia",       nome:"Cutting Edge",                 handle:"cuttingedge",              website:"cuttingedge.com.br" },
  { segmento:"petshop",         nome:"Arca de Noé Pets",             handle:"arcadenoepets",            website:"arcadenoepets.com.br" },
  { segmento:"academia",        nome:"Phoenix Fitness",              handle:"phoenixfitness",           website:"phoenixfitness.belasis.app" },
];

// ── BATCH WRITE ───────────────────────────────────────────────────────────────
async function batchInsert(docs, colRef, label) {
  const BATCH_SIZE = 400;
  let inseridos = 0, ignorados = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const doc of chunk) {
      if (!doc) { ignorados++; continue; }

      // Verifica duplicata por instagram_handle (se existir) ou nome
      let isDup = false;
      if (doc.instagram_handle) {
        const snap = await colRef.where("instagram_handle", "==", doc.instagram_handle).limit(1).get();
        if (!snap.empty) {
          // Atualiza em vez de duplicar
          await snap.docs[0].ref.update({
            website:        doc.website        || admin.firestore.FieldValue.delete(),
            has_own_website: doc.has_own_website,
            whatsapp:       doc.whatsapp       || admin.firestore.FieldValue.delete(),
            segmento:       doc.segmento       || admin.firestore.FieldValue.delete(),
            cidade:         doc.cidade         || admin.firestore.FieldValue.delete(),
            estado:         doc.estado         || admin.firestore.FieldValue.delete(),
          });
          isDup = true;
          ignorados++;
        }
      }

      if (!isDup) {
        batch.set(colRef.doc(), doc);
        inseridos++;
      }
    }

    await batch.commit();
    process.stdout.write(`\r   ${i + chunk.length}/${docs.length} processados...`);
  }

  console.log(`\n   ✅ ${label}: ${inseridos} inseridos, ${ignorados} duplicados atualizados`);
  return inseridos;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const onlySeed = args.includes("--seed") || args.length === 0;
  const csvFile  = args.find(a => !a.startsWith("--"));

  console.log("\n🦊 LeadHunter — Importador Firebase\n");

  // 1. Seed
  console.log(`📦 Importando seed (${SEED_LEADS.length} leads)...`);
  const seedDocs = SEED_LEADS.map(l => ({
    nome:            l.nome,
    nome_lower:      l.nome.toLowerCase(),
    website:         l.website || null,
    has_own_website: hasOwnWebsite(l.website),
    instagram:       "@" + l.handle,
    instagram_handle: l.handle,
    has_instagram:   true,
    segmento:        l.segmento,
    cidade:          null,
    estado:          null,
    pais:            "Brasil",
    whatsapp:        null,
    descricao:       null,
    created_at:      admin.firestore.FieldValue.serverTimestamp(),
  }));
  await batchInsert(seedDocs, db.collection("leads_extra"), "Seed");

  // 2. CSV (se fornecido)
  if (csvFile) {
    if (!fs.existsSync(csvFile)) {
      console.error(`\n❌ Arquivo não encontrado: ${csvFile}`);
      process.exit(1);
    }
    console.log(`\n📂 Lendo ${path.basename(csvFile)}...`);
    const raw  = fs.readFileSync(csvFile, "utf-8");
    const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    console.log(`   ${rows.length} linhas encontradas`);
    console.log(`   Colunas: ${Object.keys(rows[0] || {}).join(", ")}\n`);

    const docs = rows.map(csvRowToDoc);
    await batchInsert(docs, db.collection("leads_extra"), path.basename(csvFile));
  }

  // 3. Total
  const total = await db.collection("leads_extra").count().get();
  console.log(`\n📊 Total no Firestore: ${total.data().count} leads`);
  console.log("✅ Importação concluída!\n");
  process.exit(0);
}

main().catch(e => { console.error("\n❌ Erro:", e.message); process.exit(1); });
