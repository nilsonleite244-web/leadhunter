/**
 * LeadHunter Pro — Worker de Disparo WhatsApp
 * =============================================
 * Processa a fila de campanhas e envia via Evolution API (gratuita/self-hosted).
 * Tem controle anti-ban: delay aleatório, limite diário por número, horário comercial.
 *
 * Roda junto com o server.js no Railway.
 * npm install axios pg dotenv node-cron
 */

const axios  = require("axios");
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ─── CONFIG EVOLUTION API ──────────────────────────────────────────────────────
const EVOLUTION_URL      = process.env.EVOLUTION_URL;      // https://sua-evolution.railway.app
const EVOLUTION_KEY      = process.env.EVOLUTION_KEY;      // sua api key
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE; // nome da instância

// ─── CONFIG ANTI-BAN ──────────────────────────────────────────────────────────
const LIMITE_DIARIO      = parseInt(process.env.WPP_LIMITE_DIARIO || "100");  // msgs/dia por número
const DELAY_MIN_MS       = parseInt(process.env.WPP_DELAY_MIN     || "30000"); // 30s mínimo
const DELAY_MAX_MS       = parseInt(process.env.WPP_DELAY_MAX     || "90000"); // 90s máximo
const HORARIO_INICIO     = parseInt(process.env.WPP_HORA_INICIO   || "9");    // 9h
const HORARIO_FIM        = parseInt(process.env.WPP_HORA_FIM      || "19");   // 19h

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function delayAleatorio() {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
}

function dentroDoHorario() {
  const hora = new Date().getHours();
  return hora >= HORARIO_INICIO && hora < HORARIO_FIM;
}

function personalizarMensagem(template, lead) {
  return template
    .replace(/\{\{nome\}\}/gi,     lead.nome_fantasia || lead.razao_social || "")
    .replace(/\{\{socio\}\}/gi,    lead.nome_socio    || "")
    .replace(/\{\{cidade\}\}/gi,   lead.municipio_nome || "")
    .replace(/\{\{uf\}\}/gi,       lead.uf            || "")
    .replace(/\{\{segmento\}\}/gi, lead.cnae_descricao || "")
    .replace(/\{\{cnpj\}\}/gi,     formatarCNPJ(lead.cnpj))
    .trim();
}

function formatarCNPJ(cnpj) {
  if (!cnpj) return "";
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function extrairNumeroWhatsApp(telefone, ddd) {
  if (!telefone) return null;
  
  // Remove tudo que não é número
  let num = telefone.replace(/\D/g, "");
  
  // Se não tem DDI, adiciona 55 (Brasil)
  if (!num.startsWith("55")) {
    // Se não tem DDD no número, adiciona o DDD do cadastro
    if (num.length <= 9 && ddd) {
      num = ddd.replace(/\D/g, "") + num;
    }
    num = "55" + num;
  }
  
  // Normaliza para 9 dígitos (celular com 9 na frente)
  // Ex: 5511 8xxxx-xxxx → 5511 9 8xxxx-xxxx
  const partes = num.match(/^55(\d{2})(\d+)$/);
  if (partes) {
    const dddNum = partes[1];
    let resto    = partes[2];
    if (resto.length === 8 && !resto.startsWith("9")) {
      resto = "9" + resto;
    }
    num = "55" + dddNum + resto;
  }
  
  return num + "@s.whatsapp.net";
}


// ─── CONTADOR DIÁRIO ──────────────────────────────────────────────────────────

let enviadosHoje = 0;
let diaAtual     = new Date().toDateString();

function resetarContadorSeNovoDia() {
  const hoje = new Date().toDateString();
  if (hoje !== diaAtual) {
    enviadosHoje = 0;
    diaAtual     = hoje;
    console.log("[Anti-ban] Novo dia — contador reiniciado");
  }
}


// ─── ENVIO VIA EVOLUTION API ──────────────────────────────────────────────────

async function enviarWhatsApp(numero, mensagem) {
  const url = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
  
  const payload = {
    number:  numero,
    options: { delay: 1500, presence: "composing" }, // simula digitação
    textMessage: { text: mensagem },
  };

  const res = await axios.post(url, payload, {
    headers: {
      "Content-Type": "application/json",
      "apikey": EVOLUTION_KEY,
    },
    timeout: 15000,
  });

  return res.data;
}


// ─── PROCESSADOR DE CAMPANHA ───────────────────────────────────────────────────

async function processarProximoLote() {
  resetarContadorSeNovoDia();

  if (!dentroDoHorario()) {
    console.log(`[Worker] Fora do horário comercial (${HORARIO_INICIO}h–${HORARIO_FIM}h). Aguardando...`);
    return;
  }

  if (enviadosHoje >= LIMITE_DIARIO) {
    console.log(`[Anti-ban] Limite diário atingido (${LIMITE_DIARIO}). Retomando amanhã.`);
    return;
  }

  const conn = await pool.connect();
  let dest_id = null;

  try {
    // Busca próximo destinatário pendente de alguma campanha ativa
    const res = await conn.query(`
      SELECT
        cd.id       as dest_id,
        cd.cnpj,
        cd.campanha_id,
        c.mensagem_template,
        c.canal
      FROM campanha_destinatarios cd
      JOIN campanhas c ON c.id = cd.campanha_id
      WHERE cd.status = 'pendente'
        AND c.status  IN ('ativo', 'rodando')
        AND c.canal   = 'whatsapp'
      ORDER BY cd.id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    if (!res.rows.length) return;

    const dest = res.rows[0];
    dest_id = dest.dest_id;

    // Busca dados do lead
    const leadRes = await conn.query(
      "SELECT * FROM leads WHERE cnpj = $1",
      [dest.cnpj]
    );

    if (!leadRes.rows.length) {
      await conn.query(
        "UPDATE campanha_destinatarios SET status='erro', erro='Lead não encontrado' WHERE id=$1",
        [dest.dest_id]
      );
      return;
    }

    const lead   = leadRes.rows[0];
    const numero = extrairNumeroWhatsApp(lead.telefone1, lead.ddd_municipio || lead.ddd1);

    if (!numero) {
      await conn.query(
        "UPDATE campanha_destinatarios SET status='sem_numero', erro='Telefone inválido ou ausente' WHERE id=$1",
        [dest.dest_id]
      );
      return;
    }

    const mensagem = personalizarMensagem(dest.mensagem_template, lead);

    // Envia
    await enviarWhatsApp(numero, mensagem);

    // Atualiza status
    await conn.query(
      "UPDATE campanha_destinatarios SET status='enviado', enviado_at=NOW() WHERE id=$1",
      [dest.dest_id]
    );

    await conn.query(
      "UPDATE campanhas SET enviados = enviados + 1 WHERE id=$1",
      [dest.campanha_id]
    );

    enviadosHoje++;

    console.log(
      `[Worker] ✓ Enviado para ${lead.nome_fantasia || lead.razao_social} (${numero}) | ${enviadosHoje}/${LIMITE_DIARIO} hoje`
    );

    // Delay anti-ban
    const delay = delayAleatorio();
    console.log(`[Anti-ban] Aguardando ${Math.round(delay/1000)}s antes do próximo...`);
    await sleep(delay);

  } catch (err) {
    console.error(`[Worker] Erro:`, err.message);
    
    // Marca como erro para não travar a fila
    try {
      if (dest_id) {
        await conn.query(
          "UPDATE campanha_destinatarios SET status='erro', erro=$1 WHERE id=$2",
          [err.message.substring(0, 200), dest_id]
        );
      }
    } catch {}

    await sleep(10000); // pausa 10s em caso de erro
    
  } finally {
    conn.release();
  }
}


// ─── VERIFICAR INSTÂNCIA WHATSAPP ─────────────────────────────────────────────

async function verificarInstancia() {
  try {
    const res = await axios.get(
      `${EVOLUTION_URL}/instance/connectionState/${EVOLUTION_INSTANCE}`,
      { headers: { apikey: EVOLUTION_KEY }, timeout: 5000 }
    );
    const estado = res.data?.instance?.state;
    console.log(`[Evolution API] Instância "${EVOLUTION_INSTANCE}": ${estado}`);
    return estado === "open";
  } catch (e) {
    console.error("[Evolution API] Não foi possível verificar a instância:", e.message);
    return false;
  }
}


// ─── LOOP PRINCIPAL ───────────────────────────────────────────────────────────

async function iniciarWorker() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║   LeadHunter Pro — Worker WhatsApp   ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`  Limite diário: ${LIMITE_DIARIO} msgs`);
  console.log(`  Delay:         ${DELAY_MIN_MS/1000}s – ${DELAY_MAX_MS/1000}s`);
  console.log(`  Horário:       ${HORARIO_INICIO}h – ${HORARIO_FIM}h\n`);

  if (!EVOLUTION_URL || !EVOLUTION_KEY || !EVOLUTION_INSTANCE) {
    console.error("⚠ EVOLUTION_URL, EVOLUTION_KEY e EVOLUTION_INSTANCE devem estar no .env");
    process.exit(1);
  }

  const online = await verificarInstancia();
  if (!online) {
    console.warn("⚠ WhatsApp não conectado. Configure o QR Code no painel da Evolution API.");
    console.warn("  O worker aguardará até a instância estar online...\n");
  }

  // Loop contínuo com intervalo inteligente
  while (true) {
    try {
      await processarProximoLote();
    } catch (e) {
      console.error("[Loop] Erro inesperado:", e.message);
      await sleep(15000);
    }

    // Intervalo mínimo entre iterações (garante que não está em loop vazio)
    await sleep(2000);
  }
}

iniciarWorker();
