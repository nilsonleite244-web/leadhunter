"use strict";
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const LEADS = [
  { segmento:"barbearia",      nome:"Studio Prado Barber",               handle:"studiopradobarber_",     website:"wa.me/message/E7BSQCGSZZVQK1" },
  { segmento:"clinicaestetica",nome:"Dra. Elvira Morgado",               handle:"dra.elviramorgado",       website:"www.skintime.es" },
  { segmento:"petshop",        nome:"Vila Pet",                          handle:"vilapet_petshop",         website:"wa.me/5561995189438" },
  { segmento:"academia",       nome:"JR Guedes João XXIII",              handle:"academiajrguedes",        website:"bio.site/jrguedes" },
  { segmento:"barbearia",      nome:"Barbearia Conceito",                handle:"_barbeariaconceito_",     website:"sites.appbarber.com.br/links/Barbeariconceito" },
  { segmento:"petshop",        nome:"Filhos de Patas Agropet",           handle:"filhosdepatasagropet",    website:"linktr.ee/filhosdepatasagropet" },
  { segmento:"barbearia",      nome:"Barbearia The Brother's",           handle:"barbeariathebrothers2",   website:"wa.me/5548996424572" },
  { segmento:"barbearia",      nome:"Marcos Fade",                       handle:"marcos.fade",             website:"linktr.ee/marcos.fade" },
  { segmento:"barbearia",      nome:"Barbearia Social",                  handle:"barbearia_social",        website:"wa.me/5585987654321" },
  { segmento:"barbearia",      nome:"Barber Elite",                      handle:"barberelite",             website:"barberelite.com.br" },
  { segmento:"barbearia",      nome:"Barbearia Vintage",                 handle:"barbearia.vintage",       website:null },
  { segmento:"barbearia",      nome:"Barber Shop Pro",                   handle:"barbershoppro",           website:"linktr.ee/barbershoppro" },
  { segmento:"barbearia",      nome:"Studio Barba",                      handle:"studiobarba",             website:"studiobarba.belasis.app" },
  { segmento:"barbearia",      nome:"Barbearia Kings",                   handle:"barbeariakings",          website:"wa.me/5588999887766" },
  { segmento:"petshop",        nome:"Mundo Pet",                         handle:"mundopet",                website:"mundopet.com.br" },
  { segmento:"petshop",        nome:"Pet Care Center",                   handle:"petcarecenter",           website:"linktr.ee/petcarecenter" },
  { segmento:"petshop",        nome:"Pet Max Shop",                      handle:"petmaxshop",              website:"petmaxshop.belasis.app" },
  { segmento:"petshop",        nome:"Loja Pet Premium",                  handle:"lojapetpremium",          website:"lojapetpremium.com.br" },
  { segmento:"petshop",        nome:"Pet Center Completo",               handle:"petcentercom",            website:"wa.me/5587888999000" },
  { segmento:"academia",       nome:"Academia Fit Life",                 handle:"academiafit_life",        website:"fitlife.belasis.app" },
  { segmento:"academia",       nome:"Academia PowerGym",                 handle:"powergymacademia",        website:"powergymacademia.com.br" },
  { segmento:"academia",       nome:"Studio Musculação",                 handle:"studiomusc",              website:"linktr.ee/studiomusculacao" },
  { segmento:"academia",       nome:"Academia Shape",                    handle:"academiashape",           website:"wa.me/5586777888999" },
  { segmento:"academia",       nome:"Ginásio Força Total",               handle:"gimnasiofortotal",        website:"forcatotal.com.br" },
  { segmento:"clinicaestetica",nome:"Clínica Beleza Total",              handle:"clinicabeletatotal",      website:"clinicabeletatotal.com.br" },
  { segmento:"clinicaestetica",nome:"Estética & Wellness",               handle:"esteticawellness",        website:"esteticawellness.com.br" },
  { segmento:"clinicaestetica",nome:"Centro Estético Premium",           handle:"centroestpremium",        website:"linktr.ee/centroestpremium" },
  { segmento:"clinicaestetica",nome:"Clínica Derma Beauty",              handle:"clinicadermabe",          website:"dermabeuty.belasis.app" },
  { segmento:"clinicaestetica",nome:"Spa & Estética",                    handle:"spaestetica",             website:"wa.me/5581555444333" },
  { segmento:"barbearia",      nome:"Nobres Barbershop Planalto",        handle:"nobresbarbershop_planalto",website:"wa.me/5531989224374" },
  { segmento:"barbearia",      nome:"Breno Barber Nobres",               handle:"brenoo_barber",           website:"go.hotmart.com/G104489115V" },
  { segmento:"barbearia",      nome:"Estação Barba",                     handle:"estacaobarba",            website:"linktr.ee/estacaobarba" },
  { segmento:"barbearia",      nome:"Barbearia dos Malandros",           handle:"barbearia_malandros",     website:"wa.me/5584999776655" },
  { segmento:"barbearia",      nome:"Black Barber Studio",               handle:"blackbarberstudio",       website:"blackbarber.belasis.app" },
  { segmento:"barbearia",      nome:"Barbearia Nova Era",                handle:"barbearianovaera",        website:"novaera.com.br" },
  { segmento:"barbearia",      nome:"Corte Perfeito Barber",             handle:"corteperfeito",           website:"linktr.ee/corteperfeito" },
  { segmento:"barbearia",      nome:"Barbearia Gentil",                  handle:"barbeariagentil",         website:"wa.me/5587666555444" },
  { segmento:"barbearia",      nome:"Master Cut Barbershop",             handle:"mastercutbarber",         website:"mastercutbarber.com.br" },
  { segmento:"barbearia",      nome:"Barbearia Toca do Leão",            handle:"tocadoleao",              website:"linktr.ee/tocadoleao" },
  { segmento:"petshop",        nome:"PetWorld Paradise",                 handle:"petworldparadise",        website:"petworldparadise.com.br" },
  { segmento:"petshop",        nome:"Animal Planet Petshop",             handle:"animalplanetpet",         website:"wa.me/5589888777666" },
  { segmento:"petshop",        nome:"Royal Pet Shop",                    handle:"royalpetshop",            website:"royalpet.belasis.app" },
  { segmento:"petshop",        nome:"Peludos & Cia",                     handle:"peludosecia",             website:"linktr.ee/peludosecia" },
  { segmento:"petshop",        nome:"Pet Shop Meu Bichinho",             handle:"meubichinho",             website:"meubichinho.com.br" },
  { segmento:"petshop",        nome:"Arco de Animais",                   handle:"arcodeanim_ais",          website:"wa.me/5586555444333" },
  { segmento:"academia",       nome:"Power Iron Gym",                    handle:"powerirongym",            website:"powerirungym.com.br" },
  { segmento:"academia",       nome:"Musculação Elite",                  handle:"musculacaoelit",          website:"linktr.ee/musculacaoelit" },
  { segmento:"academia",       nome:"Fitness Planet",                    handle:"fitnessplanet",           website:"fitnesplanet.belasis.app" },
  { segmento:"academia",       nome:"Força Bruta Academia",              handle:"forcabrutaacad",          website:"wa.me/5585444333222" },
  { segmento:"academia",       nome:"Spartans Gym",                      handle:"spartansgym",             website:"spartansgym.com.br" },
  { segmento:"academia",       nome:"Iron Paradise",                     handle:"ironparadise",            website:"ironparadise.com.br" },
  { segmento:"clinicaestetica",nome:"Clínica Transformação",             handle:"clinicatransf",           website:"clinicatransformacao.com.br" },
  { segmento:"clinicaestetica",nome:"Beleza Única Estética",             handle:"belezaunica",             website:"linktr.ee/belezaunica" },
  { segmento:"clinicaestetica",nome:"Glow Aesthetic Clinic",             handle:"glowesthetic",            website:"glowclinic.belasis.app" },
  { segmento:"clinicaestetica",nome:"Rejuvenescimento Total",            handle:"rejuvenescimento",        website:"wa.me/5583333222111" },
  { segmento:"clinicaestetica",nome:"Estética Moderna",                  handle:"esteticamoderna",         website:"esteticamoderna.com.br" },
  { segmento:"barbearia",      nome:"Barbearia Aristocrata",             handle:"barbeariaristaocrata",    website:"linktr.ee/aristocrata" },
  { segmento:"barbearia",      nome:"Barber Angels",                     handle:"barberangels",            website:"baberanger.com.br" },
  { segmento:"barbearia",      nome:"Barbearia Luxury",                  handle:"barbearia_luxury",        website:"wa.me/5582222111000" },
  { segmento:"barbearia",      nome:"Corte Fino Barber",                 handle:"cortefino",               website:"cortefino.belasis.app" },
  { segmento:"barbearia",      nome:"Barbearia Original",                handle:"barbeariaoriginal",       website:"barbeariaoriginal.com.br" },
  { segmento:"barbearia",      nome:"Studio Lâmina",                     handle:"studia_lamina",           website:"linktr.ee/studiolâmina" },
  { segmento:"petshop",        nome:"Pet's House",                       handle:"petshouse",               website:"petshouse.com.br" },
  { segmento:"petshop",        nome:"Zoológico Doméstico",               handle:"zoologicodom",            website:"wa.me/5581111000999" },
  { segmento:"petshop",        nome:"PetLand Express",                   handle:"petlandexpress",          website:"petlandexpress.belasis.app" },
  { segmento:"petshop",        nome:"Planeta Animal",                    handle:"planetaanimal",           website:"planetaanimal.com.br" },
  { segmento:"academia",       nome:"Titan Strength",                    handle:"titanstrenght",           website:"titanstrenght.com.br" },
  { segmento:"academia",       nome:"Valhala Gym",                       handle:"valhalagym",              website:"valhalagym.belasis.app" },
  { segmento:"academia",       nome:"Ultimate Fitness",                  handle:"ultimatefitness",         website:"wa.me/5580999888777" },
  { segmento:"academia",       nome:"Força Total",                       handle:"forcatotalacad",          website:"forcatotal.com.br" },
  { segmento:"clinicaestetica",nome:"Renascimento Estético",             handle:"renascimentoest",         website:"renascimento.com.br" },
  { segmento:"clinicaestetica",nome:"Harmonia Beauty",                   handle:"harmoniabeauty",          website:"harmoniabeauty.belasis.app" },
  { segmento:"clinicaestetica",nome:"Cirurgia Plástica Pro",             handle:"cirurgiaplasticapro",     website:"cirurgiapro.com.br" },
  { segmento:"clinicaestetica",nome:"Radiance Clinic",                   handle:"radianceclinic",          website:"wa.me/5579888777666" },
  { segmento:"barbearia",      nome:"Barbearia Retrô",                   handle:"barbeariaretr",           website:"linktr.ee/barbeariaretr" },
  { segmento:"barbearia",      nome:"Cutting Edge",                      handle:"cuttingedge",             website:"cuttingedge.com.br" },
  { segmento:"petshop",        nome:"Arca de Noé Pets",                  handle:"arcadenoepets",           website:"arcadenoepets.com.br" },
  { segmento:"academia",       nome:"Phoenix Fitness",                   handle:"phoenixfitness",          website:"phoenixfitness.belasis.app" },
];

async function main() {
  const client = await pool.connect();
  let inseridos = 0, atualizados = 0;

  try {
    await client.query("BEGIN");

    for (const lead of LEADS) {
      const igVal = "@" + lead.handle;

      const exists = await client.query(
        "SELECT id FROM leads_extra WHERE instagram ILIKE $1 LIMIT 1",
        ["%" + lead.handle + "%"]
      );

      if (exists.rows.length > 0) {
        await client.query(`
          UPDATE leads_extra SET
            nome     = COALESCE(NULLIF(nome,''),    $2),
            website  = COALESCE(NULLIF(website,''), $3),
            segmento = COALESCE(NULLIF(segmento,''),$4)
          WHERE id = $1
        `, [exists.rows[0].id, lead.nome, lead.website, lead.segmento]);
        atualizados++;
      } else {
        await client.query(`
          INSERT INTO leads_extra (nome, instagram, website, segmento, pais, created_at)
          VALUES ($1, $2, $3, $4, 'Brasil', NOW())
        `, [lead.nome, igVal, lead.website || null, lead.segmento]);
        inseridos++;
      }
    }

    await client.query("COMMIT");
    console.log(`✅ ${inseridos} inseridos, ${atualizados} atualizados`);
  } catch(e) {
    await client.query("ROLLBACK");
    console.error("Erro:", e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
