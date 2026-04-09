"use strict";
require("dotenv").config();
const admin = require("firebase-admin");

let credential;
try {
  credential = admin.credential.cert(require("./firebase-service-account.json"));
} catch {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
}
admin.initializeApp({ credential });
const db = admin.firestore();

const EMAIL = "nilsonleite244@gmail.com";
const TOKEN = "43502af41562f9e4aa0b84585af767ba3736ba874e876eead60be9c49d6236a4";

async function main() {
  const ref = db.collection("assinantes").doc(EMAIL);
  const existing = await ref.get();

  if (existing.exists) {
    console.log("Documento existente:", JSON.stringify(existing.data(), null, 2));
    // Garante que está ativo com token correto
    await ref.update({
      token: TOKEN,
      status: "ativo",
      plano: "vitalicio",
      expira_em: null,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Assinante atualizado com token e status ativo");
  } else {
    await ref.set({
      email: EMAIL,
      nome: "Nilson Leite (Admin)",
      status: "ativo",
      token: TOKEN,
      plano: "vitalicio",
      expira_em: null,
      leads_hoje: 0,
      leads_data: null,
      ativado_em: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Assinante admin criado com sucesso");
  }

  console.log("\n📧 Email:", EMAIL);
  console.log("🔑 Token:", TOKEN);
  console.log("📦 Plano: vitalicio");
  process.exit(0);
}

main().catch(e => { console.error("Erro:", e.message); process.exit(1); });
