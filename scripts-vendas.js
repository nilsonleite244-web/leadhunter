/**
 * LeadHunter — Recomendador de Copy para Venda de Sites
 * Scripts por segmento: abertura, proposta, objeções, follow-up, fechamento
 * Variáveis: {{nome}} {{cidade}} {{segmento}} {{instagram}}
 */

const SCRIPTS_VENDAS = {

  // ─────────────────────────────────────────────────────────────────
  "barbearia": {
    titulo: "Barbearia",
    emoji: "✂️",
    dor: "A maioria dos barbeiros perde clientes novos porque não aparece no Google.",
    abertura: `Oi! Vi o perfil da {{nome}} aqui no Instagram — trabalho incrível de vocês 🔥

Pergunta rápida: quando alguém pesquisa *"barbearia em {{cidade}}"* no Google, vocês aparecem?`,

    seguimento_positivo: `Que ótimo que você topou conversar!

Então deixa eu ser direto: a maioria das barbearias que mais faturam em {{cidade}} tem uma coisa em comum — um site simples que aparece no Google quando o cliente pesquisa.

Não é nada complexo. É uma página que mostra seus serviços, preços, fotos dos cortes, botão direto pro WhatsApp e endereço no mapa.

O resultado? Clientes novos chegando todo dia sem precisar ficar postando todo dia no Instagram.

Posso te mostrar um exemplo de como ficaria pra {{nome}}?`,

    proposta: `Aqui está o que eu faço pra barbearias como a {{nome}}:

✅ Site profissional com seus serviços e preços
✅ Galeria de fotos dos seus melhores cortes
✅ Botão de agendamento direto no WhatsApp
✅ Endereço com mapa integrado (Google Maps)
✅ Aparece no Google quando pesquisam "barbearia em {{cidade}}"
✅ Adaptado para celular (onde 90% dos clientes vão acessar)

*Investimento único: a partir de R$597*
(sem mensalidade, é seu para sempre)

Você precisa trazer só 2 clientes novos pelo site pra já se pagar. Depois disso é lucro puro.

Posso montar uma prévia gratuita pra você ver como ficaria antes de fechar?`,

    objecoes: [
      {
        texto: "Já tenho Instagram, não preciso de site",
        resposta: `Entendo! O Instagram é ótimo pra quem já te segue.

Mas pensa comigo: quando um pai chega novo em {{cidade}} e quer cortar o cabelo do filho, o que ele faz? Abre o Google e digita *"barbearia em {{cidade}}"*.

Nessa hora, seu Instagram não aparece. Seu concorrente com site aparece. E fica com o cliente.

O site não substitui o Instagram — ele captura quem ainda não te conhece. São duas fontes de cliente diferentes.`
      },
      {
        texto: "Tá caro / não tenho grana agora",
        resposta: `Faz sentido querer analisar o investimento.

Me diz uma coisa: quanto você ganha com um cliente novo que vira frequente? R$50, R$80 por mês?

Com o site você precisa trazer só 1 cliente novo por mês durante 1 ano pra se pagar. Tudo que vier depois é lucro.

E se preferir, tenho opção de parcelamento em até 3x sem juros. Quer que eu monte a proposta com essa condição?`
      },
      {
        texto: "Não tenho tempo pra cuidar de site",
        resposta: `Melhor notícia: você não precisa fazer nada.

Eu cuido de tudo — criação, texto, fotos, publicação no Google. Você só aprova o layout antes de publicar.

Tempo seu: uns 20 minutos pra me passar as informações e aprovar. Depois o site trabalha sozinho por você.`
      },
      {
        texto: "Vou pensar",
        resposta: `Claro, decisão importante merece reflexão!

Só uma coisa: enquanto você pensa, seu concorrente aqui em {{cidade}} provavelmente já tem site e está aparecendo no Google agora.

Me fala o que você precisa avaliar — preço, resultado, prazo? Posso tirar qualquer dúvida agora mesmo pra te ajudar a decidir com mais segurança.`
      },
      {
        texto: "Já tentei site antes e não funcionou",
        resposta: `Boa de saber isso! Me conta o que aconteceu?

Na maioria dos casos o site não funciona por 2 motivos: foi feito sem otimização pro Google (SEO), então ninguém acha — ou foi muito complicado de navegar no celular.

O que eu faço é diferente: site simples, rápido, feito pra aparecer no Google e fechar cliente no WhatsApp. Não é aquele site bonitão que ninguém usa.

Posso te mostrar o resultado de outros clientes aqui da região?`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Só passando pra saber se você teve chance de pensar na conversa de ontem sobre o site.

Pergunta rápida: hoje quando alguém pesquisa barbearia no Google em {{cidade}}, você sabe quem aparece nos primeiros resultados? São seus concorrentes diretos.

Posso te mandar uma análise rápida mostrando essa diferença?`,

    followup_48h: `Oi! Sei que você deve estar cheio de cliente — sinal de que o negócio tá bem! 💈

Vou ser breve: tenho uma abertura essa semana para mais 1 barbearia em {{cidade}}.

Se quiser garantir antes que eu feche com outro, me fala. Se não for o momento, sem problema — fica o contato!`,

    fechamento: `Perfeito, vamos fechar!

Próximos passos:
1️⃣ Você me manda: logo (se tiver), 5-10 fotos dos seus melhores cortes, lista de serviços e preços
2️⃣ Em até 3 dias úteis eu monto o layout e te mando pra aprovar
3️⃣ Você aprova ou pede ajustes (sem limite de revisões)
4️⃣ Em até 7 dias úteis o site tá no ar e indexado no Google

Forma de pagamento: PIX, cartão ou transferência. Parcelamos em até 3x.

Qual você prefere?`,

    dicas: [
      "Mande a mensagem de abertura às 10h ou às 14h — horário de menor movimento na barbearia",
      "Se o perfil do Instagram tiver poucas curtidas, mencione que o site vai trazer visibilidade que o Instagram sozinho não traz",
      "Barbearias valorizam MUITO fotos dos cortes — mencione a galeria de fotos como benefício principal",
      "Ofereça incluir sistema de agendamento online como diferencial"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "salao de beleza": {
    titulo: "Salão de Beleza",
    emoji: "💇",
    dor: "Salões perdem agendamentos para concorrentes que aparecem no Google.",
    abertura: `Oi! Vi o trabalho lindo da {{nome}} no Instagram 😍

Curiosidade: vocês costumam receber clientes novas que chegaram pelo Google, ou praticamente todas vêm por indicação e Instagram?`,

    seguimento_positivo: `Faz total sentido! Indicação é o melhor canal — mas tem um limite de crescimento.

O que um site bem feito faz é criar um terceiro canal: pessoas que nunca ouviram falar de vocês, pesquisando *"salão de beleza em {{cidade}}"* no Google, e chegando direto no WhatsApp de vocês.

É a diferença entre esperar o cliente aparecer e ir buscar ele onde ele já está procurando.

Posso mostrar como ficaria um site pra {{nome}}?`,

    proposta: `Para a {{nome}}, eu criaria:

✅ Página com todos os serviços (cabelo, unhas, sobrancelha, etc.)
✅ Tabela de preços (atrai clientes que já vão decididos)
✅ Galeria com os melhores trabalhos das profissionais
✅ Botão de agendamento direto no WhatsApp
✅ Depoimentos de clientes (prova social fortíssima)
✅ Otimizado pra aparecer no Google de {{cidade}}

*Investimento: a partir de R$647*

Um salão com boa presença online agenda em média 15-20 clientes novos por mês só pelo Google. Isso é mais de R$2.000 extras por mês.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já tenho Instagram",
        resposta: `Instagram é excelente para fidelizar quem já te conhece.

Mas pensa: quando uma mulher se muda pra {{cidade}} e precisa de salão, ela não vai no Instagram — ela pesquisa no Google. É um público completamente diferente.

O site captura quem está ativamente procurando. O Instagram mantém quem já é cliente. Os dois juntos = salão cheio.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Vamos colocar na ponta do lápis:

Se o site trouxer só 8 clientes novas por mês (bem conservador), a R$80 cada, são R$640 extras. O site se paga no primeiro mês.

E continua trazendo clientes todo mês, para sempre, sem custo adicional.

Consigo parcelar em até 3x pra facilitar. Quer que eu monte uma proposta com isso?`
      },
      {
        texto: "Não tenho tempo",
        resposta: `Você não vai precisar fazer nada, sério!

Eu monto tudo com as informações que já estão no seu Instagram. Você só precisa de uns 15 minutos pra aprovar o layout.

Depois disso o site trabalha 24h por dia pra você, sem precisar postar, sem precisar responder story, sem precisar fazer nada.`
      },
      {
        texto: "Preciso falar com minha sócia",
        resposta: `Claro, decisão em dupla é sempre mais segura!

Posso preparar uma apresentação rápida (PDF ou vídeo) com tudo explicado para vocês duas avaliarem juntas?

Assim fica mais fácil alinhar antes de conversar. O que acha?`
      }
    ],

    followup_24h: `Oi {{nome}}! Passando rapidinho 👋

Fiz uma pesquisa aqui: busquei *"salão de beleza em {{cidade}}"* no Google agora.

Apareceram [X concorrentes com site]. Nenhum deles tem o trabalho que vocês mostram no Instagram.

Imagina se quem pesquisou isso achasse a {{nome}} primeiro? Posso te mostrar como isso funcionaria na prática?`,

    followup_48h: `Oi! Sei que o movimento no salão é intenso 💆‍♀️

Tenho um horário livre essa semana pra mais um projeto em {{cidade}}. Se quiser garantir, me fala — se não for o momento certo, tudo bem também!`,

    fechamento: `Ótimo! Vamos começar 🎉

Me manda por aqui:
• Logo do salão (se tiver)
• Lista de serviços e preços
• 8-10 fotos dos seus melhores trabalhos
• Horário de funcionamento
• Endereço completo

Prazo: layout em 3 dias, site no ar em 7 dias.

Você prefere pagar via PIX (com desconto de 5%) ou parcelado no cartão?`,

    dicas: [
      "Mencione que vai incluir os depoimentos do Instagram no site — isso gera confiança imediata",
      "Salões geralmente têm várias profissionais — sugira uma seção 'Nossa Equipe' como diferencial",
      "Ofereça integrar com Google Meu Negócio para aparecer no Maps",
      "Mande a mensagem entre 9h-11h, quando o movimento ainda está baixo"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "clinica estetica": {
    titulo: "Clínica Estética",
    emoji: "✨",
    dor: "Clínicas estéticas sem site perdem para concorrentes nas buscas do Google.",
    abertura: `Oi! Vi o perfil da {{nome}} no Instagram — os resultados de vocês são impressionantes ✨

Uma pergunta: vocês já recebem clientes que chegaram direto pelo Google, ou o fluxo ainda vem principalmente pelo Instagram e indicação?`,

    seguimento_positivo: `Faz todo sentido! E imagina potencializar isso com o Google.

Quem pesquisa *"clínica estética em {{cidade}}"* está com intenção de compra altíssima — já decidiu que quer o serviço, só precisa escolher onde.

Um site bem posicionado captura exatamente esse público. E pra clínicas estéticas, onde um procedimento pode custar R$300 a R$2.000, cada cliente novo via Google representa retorno imediato.

Posso te mostrar como funcionaria pra {{nome}}?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Página de cada procedimento com descrição, benefícios e antes/depois
✅ Formulário de agendamento online
✅ Galeria de resultados (o principal gatilho de venda)
✅ Seção de depoimentos e avaliações
✅ Perfil das profissionais (humaniza e gera confiança)
✅ Otimizado pro Google de {{cidade}}
✅ Chat direto pro WhatsApp

*Investimento: a partir de R$797*

Um único procedimento de R$400 já paga o site. Depois disso, cada cliente novo é lucro puro.

Quer ver uma prévia com a identidade visual da {{nome}}?`,

    objecoes: [
      {
        texto: "Já tenho Instagram e funciona bem",
        resposta: `Instagram funciona bem pra quem já te segue. Ótimo!

Mas tem um público maior que você não está alcançando: pessoas que nunca ouviram falar da {{nome}}, pesquisando agora no Google procedimentos que vocês oferecem.

Esses clientes têm intenção de compra imediata. E se o seu site não aparecer, eles vão pra quem aparece.`
      },
      {
        texto: "Tá caro para minha clínica",
        resposta: `Entendo! Vamos fazer uma conta rápida:

Qual o ticket médio de um procedimento na {{nome}}? Mesmo que seja R$300...

O site precisa trazer só 2 clientes novos pra se pagar. Com o posicionamento certo no Google de {{cidade}}, 2 clientes novos por mês é meta muito conservadora.

Consigo parcelar em até 3x sem juros. Quer montar a proposta assim?`
      },
      {
        texto: "Preciso ver resultado primeiro",
        resposta: `Totalmente justo!

Posso te mostrar cases de clínicas que já trabalho e o tráfego que estão recebendo pelo Google. Resultados reais, não promessa.

E ofereço garantia: se em 90 dias o site não trouxer nenhum cliente novo, devolvo o valor investido. Sem letras miúdas.

Posso te mandar os cases agora?`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Fiz uma análise rápida das clínicas estéticas que aparecem no Google em {{cidade}}.

Identifiquei que nenhuma das primeiras tem uma galeria de antes/depois tão boa quanto a de vocês no Instagram.

Isso é uma oportunidade enorme — a {{nome}} com um site teria vantagem competitiva real. Posso te mostrar?`,

    followup_48h: `Oi! Sei que agenda de clínica não para 😊

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar antes que eu feche com outro, me fala.

Se não for o momento, tudo bem — fica o contato!`,

    fechamento: `Excelente decisão! Clínicas estéticas com site bem feito têm resultados incríveis no Google.

Pra começar, me manda:
• Logo e paleta de cores (se tiver)
• Lista de procedimentos com descrições
• Fotos de antes/depois (quanto mais, melhor)
• Depoimentos de clientes
• Horários e endereço

Prazo: layout em 4 dias, site no ar em 8 dias.

PIX (5% desconto) ou parcelado em 3x no cartão?`,

    dicas: [
      "O antes/depois é o maior gatilho de venda para clínicas — mencione isso na abordagem",
      "Clínicas têm ticket médio alto, então o ROI do site é muito rápido — use isso no argumento",
      "Sugira integrar com sistema de agendamento online (Doctoralia, etc.) como diferencial",
      "Mande mensagem entre 8h-10h antes da agenda do dia começar"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "academia": {
    titulo: "Academia",
    emoji: "💪",
    dor: "Academias sem site perdem matrículas para concorrentes que aparecem no Google.",
    abertura: `Oi! Vi a {{nome}} no Instagram — estrutura incrível de vocês 💪

Curiosidade: quando alguém pesquisa *"academia em {{cidade}}"* no Google, vocês costumam aparecer nos primeiros resultados?`,

    seguimento_positivo: `Faz sentido! E esse é exatamente o ponto.

Toda pessoa que se muda pra {{cidade}}, toda pessoa que decide começar academia em janeiro, toda pessoa que está insatisfeita com a academia atual — elas pesquisam no Google.

Se a {{nome}} não aparece nesses resultados, você está perdendo matrículas todo mês sem nem saber.

Posso te mostrar como mudar isso?`,

    proposta: `Para a {{nome}}, eu criaria:

✅ Página com planos e preços (resolve a dúvida antes mesmo de ligar)
✅ Tour virtual em fotos/vídeo da estrutura
✅ Lista de modalidades oferecidas
✅ Perfil dos professores
✅ Depoimentos de alunos
✅ Formulário de contato e visita gratuita
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$697*

Uma matrícula de R$80/mês = R$960/ano. O site precisa trazer 1 aluno novo pra se pagar. Só 1.

Quer ver como ficaria?`,

    objecoes: [
      {
        texto: "Já temos clientes suficientes",
        resposta: `Que ótimo! Academia cheia é sinal de qualidade.

Mas pensa: academias têm uma rotatividade natural de 20-30% ao ano. Alunos que mudam de cidade, mudam de horário, param por algum motivo.

Um site garante que você repõe essa rotatividade com clientes novos chegando passivamente, sem precisar investir em anúncio ou panfleto.

É uma fonte de matrícula que trabalha 24h sem custo adicional.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Vamos comparar:

Você gasta R$X por mês em panfleto, anúncio ou outra divulgação?

O site é um investimento único. R$697 dividido em 12 meses = menos de R$60/mês. E funciona pra sempre, diferente do anúncio que para quando o dinheiro acaba.

Consigo parcelar em 3x sem juros. Faz sentido?`
      },
      {
        texto: "Não tenho fotos boas da academia",
        resposta: `Isso a gente resolve! Tenho dois caminhos:

1. Usamos as fotos que já estão no Instagram (geralmente já são boas o suficiente)
2. Posso te indicar um fotógrafo parceiro em {{cidade}} que faz fotos profissionais de academia a um custo bem acessível

O site fica muito melhor com fotos profissionais, mas já dá pra fazer um excelente trabalho com o que você tem.`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Uma informação que pode ser útil: pesquisei agora *"academia em {{cidade}}"* no Google.

As primeiras academias que aparecem têm sites com planos, fotos e depoimentos. É exatamente o que atrai quem está decidindo onde matricular.

A {{nome}} tem tudo isso — falta só o site. Posso montar uma proposta rápida?`,

    followup_48h: `Ei! Sei que academia no começo do dia é correria 🏋️

Vou ser direto: tenho um horário pra fechar mais um projeto em {{cidade}} essa semana.

Se quiser bater um papo de 10 minutos, me fala. Se não for o momento, tudo bem!`,

    fechamento: `Bora! Academias bem posicionadas no Google enchem rápido.

Me manda:
• Logo e cores da academia
• Lista de modalidades e horários
• Tabela de planos e preços
• Fotos da estrutura (equipamentos, espaço, etc.)
• Fotos dos professores (se possível)

Prazo: layout em 3 dias, site no ar em 7 dias.

Como prefere pagar — PIX ou parcelado?`,

    dicas: [
      "Academias têm pico de buscas em janeiro e julho — mencione sazonalidade se for nessa época",
      "Sugira incluir uma oferta de 'aula experimental gratuita' como CTA principal",
      "Professores com bio geram muita confiança — mencione isso",
      "Mande mensagem segunda ou terça de manhã, quando o dono costuma ter mais tempo"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "pet shop": {
    titulo: "Pet Shop",
    emoji: "🐾",
    dor: "Donos de pets pesquisam no Google antes de escolher pet shop — sem site você fica de fora.",
    abertura: `Oi! Vi o perfil da {{nome}} no Instagram — que fotos fofas dos pets 🐾

Me diz uma coisa: quando alguém com pet novo chega em {{cidade}}, você acha que ele vai no Google ou no Instagram pra encontrar um pet shop?`,

    seguimento_positivo: `Exatamente — é quase sempre o Google.

E dono de pet é um dos clientes mais fiéis que existe. Quando ele encontra um pet shop de confiança, ele volta todo mês, pra banho, tosa, ração, veterinário...

Um único cliente fiel pode valer R$200-400 por mês, todo mês, por anos.

O site da {{nome}} seria a porta de entrada pro Google capturar esses clientes. Posso te mostrar como funcionaria?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Serviços com preços (banho, tosa, consulta, etc.)
✅ Galeria de pets atendidos (irresistível!)
✅ Agendamento direto pelo WhatsApp
✅ Informações sobre produtos e rações vendidas
✅ Depoimentos de clientes e seus pets
✅ Localização no mapa
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$597*

Um cliente fiel de pet shop vale fácil R$3.000/ano. O site precisa trazer 1 pra se pagar.

Quer uma prévia?`,

    objecoes: [
      {
        texto: "Já tenho clientes fixos",
        resposta: `Ótimo sinal! Mas pensa: pet shops têm perda natural de clientes — pessoas que mudam, pets que ficam idosos...

E toda semana chega família nova em {{cidade}} com pet precisando de banho, tosa e produtos. Esses clientes pesquisam no Google.

O site garante que você captura esse fluxo constante de clientes novos, mesmo sem fazer nada.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Mas vamos fazer a conta:

Banho + tosa = em média R$60-80. Cliente que vem 1x por mês = ~R$900/ano.

O site precisa trazer só 1 cliente novo pra se pagar. Com boa posição no Google de {{cidade}}, isso acontece no primeiro mês.

Parcelamos em 3x. Quer montar a proposta?`
      },
      {
        texto: "Não sei mexer em site",
        resposta: `Você não vai precisar mexer em nada!

Eu faço tudo, publico tudo, otimizo tudo. Você só aprova antes de publicar.

Depois que o site está no ar, ele funciona sozinho. Se quiser atualizar alguma coisa no futuro (novo serviço, preço novo), me chama que eu atualizo — sem custo adicional.`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem por aí? 🐕

Fiz uma pesquisa rápida: busquei *"pet shop em {{cidade}}"* no Google.

Os primeiros resultados são concorrentes com site. E nenhum tem as fotos fofas que vocês têm no Instagram.

Imagina esses pets todos aparecendo no Google quando alguém busca pet shop em {{cidade}}? Posso te mostrar como ficaria?`,

    followup_48h: `Oi! Sei que pet shop não para um segundo 🐾

Tenho uma vaga aberta pra mais um projeto em {{cidade}} essa semana. Se quiser garantir antes que eu feche com outro, me fala!`,

    fechamento: `Boa escolha! Pet shops com site bem feito enchem a agenda 🐾

Me manda:
• Logo e cores do pet shop
• Lista de serviços e preços (banho, tosa, veterinário, etc.)
• Fotos dos pets atendidos (quanto mais, melhor!)
• Depoimentos de clientes (pode ser do Google ou Instagram)
• Endereço e horários

Prazo: layout em 3 dias, site no ar em 7 dias.

PIX ou parcelado em 3x?`,

    dicas: [
      "Fotos de pets no site são um gatilho de conversão enorme — enfatize isso",
      "Sugira incluir seção de 'nossos clientes' com fotos dos pets atendidos",
      "Dono de pet é muito fiel — destaque o valor do cliente recorrente no argumento",
      "Bom horário: entre 8h-10h, antes do movimento do dia começar"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "clinica odontologica": {
    titulo: "Clínica Odontológica",
    emoji: "🦷",
    dor: "Pacientes pesquisam dentista no Google — clínicas sem site perdem consultas todo dia.",
    abertura: `Oi! Vi a {{nome}} no Instagram.

Pergunta direta: vocês costumam ter agenda cheia durante a semana toda, ou tem horários vagos que poderiam ser preenchidos com pacientes novos?`,

    seguimento_positivo: `Faz sentido querer otimizar a agenda!

Sabe qual é a principal forma que pacientes novos encontram dentista hoje? Google. Não é indicação, não é Instagram — é *"dentista em {{cidade}}"* no buscador.

Uma clínica bem posicionada no Google recebe de 10 a 30 contatos de pacientes novos por mês só pelo site.

Posso te mostrar como a {{nome}} capturaria esse fluxo?`,

    proposta: `Para a {{nome}}, eu criaria:

✅ Página de cada especialidade (clínico geral, ortodontia, implante, etc.)
✅ Perfil dos dentistas com CRO e especialização
✅ Formulário de agendamento online
✅ Informações sobre planos aceitos
✅ Galeria de casos (sorriso antes/depois)
✅ Depoimentos de pacientes
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$897*

Uma consulta de avaliação + tratamento pode gerar R$500 a R$5.000 por paciente. O site precisa trazer 1 paciente pra se pagar.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já tenho pacientes suficientes por indicação",
        resposta: `Que ótimo! Clínica que cresce por indicação tem qualidade reconhecida.

Mas pensa: indicação tem um teto. Você cresce até o limite da rede de quem já te conhece.

O Google não tem teto. Toda pessoa nova em {{cidade}}, toda pessoa insatisfeita com o dentista atual, toda pessoa precisando de um especialista que você tem — ela pesquisa no Google.

O site não substitui a indicação. Ele adiciona um canal que escala sem limite.`
      },
      {
        texto: "Tá caro para nossa clínica",
        resposta: `Entendo a preocupação! Vamos calcular:

Qual o valor médio de um tratamento completo na {{nome}}? Mesmo R$800 de consulta + raio-x + procedimento...

O site precisa trazer 1 paciente novo. Com boa posição no Google de {{cidade}}, isso acontece em semanas.

Parcelamos em 3x sem juros. Faz sentido pra vocês?`
      },
      {
        texto: "Preciso autorização do sócio/sócia",
        resposta: `Claro! Posso preparar uma apresentação rápida com a proposta completa para vocês avaliarem juntos?

Com números, exemplos de resultado e condições de pagamento — fica mais fácil tomar a decisão em conjunto.

Me passa o e-mail de vocês que envio ainda hoje.`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Fiz uma busca agora: *"dentista em {{cidade}}"* no Google.

Apareceram [clínicas concorrentes] nos primeiros resultados, todas com site. Nenhuma tem especialistas tão qualificados quanto os da {{nome}}.

Essa é uma vantagem competitiva que vocês ainda não estão aproveitando. Posso te mandar uma análise rápida?`,

    followup_48h: `Oi! Sei que agenda de clínica é cheia.

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiserem conversar antes que eu feche, me avisem.

Se não for o momento, tudo bem também!`,

    fechamento: `Excelente! Clínicas odontológicas têm excelente retorno com presença no Google.

Pra começar, me manda:
• Logo e identidade visual
• Lista de especialidades e tratamentos
• Fotos dos dentistas e da clínica
• CROs dos profissionais
• Planos de saúde aceitos
• Casos de antes/depois (opcional mas muito poderoso)

Prazo: layout em 4 dias, site no ar em 8 dias.

Como prefere pagar?`,

    dicas: [
      "Mencione que o site vai aparecer quando pesquisarem especialidades específicas (implante, ortodontia, etc.)",
      "Perfil dos dentistas com foto e CRO gera MUITA confiança — destaque isso",
      "Antes/depois de sorriso é gatilho poderoso — pergunte se têm casos para usar",
      "Mande a mensagem terça ou quarta, dias mais tranquilos de agenda"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "nutricionista": {
    titulo: "Nutricionista",
    emoji: "🥗",
    dor: "Nutricionistas sem site dependem só do Instagram para conseguir pacientes novos.",
    abertura: `Oi! Vi o seu perfil no Instagram — conteúdo muito bom sobre nutrição 🥗

Me diz: a maioria dos seus pacientes novos chega pelo Instagram ou você gostaria de ter uma fonte de pacientes mais previsível?`,

    seguimento_positivo: `Entendo! Instagram traz cliente, mas é imprevisível — depende de post, de algoritmo, de consistência.

Um site bem posicionado no Google traz pacientes de forma previsível. Toda vez que alguém pesquisa *"nutricionista em {{cidade}}"*, você aparece. Seja segunda ou sábado, de manhã ou de noite.

E paciente de nutrição geralmente é recorrente — vem todo mês por meses ou anos.

Posso te mostrar como ficaria pra você?`,

    proposta: `Para o seu consultório, o site teria:

✅ Apresentação profissional com foto, CRN e especialização
✅ Detalhamento dos atendimentos (emagrecimento, esportiva, clínica, etc.)
✅ Como funciona a primeira consulta
✅ Depoimentos de pacientes (com autorização)
✅ Formulário de agendamento
✅ Blog com dicas de nutrição (posiciona no Google organicamente)
✅ Otimizado pra aparecer em {{cidade}}

*Investimento: a partir de R$597*

Um paciente que consulta mensalmente por 1 ano = R$1.200+ de receita. O site precisa trazer 1.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já consigo pacientes pelo Instagram",
        resposta: `Ótimo! E imagina ter duas fontes ao mesmo tempo?

Instagram = quem já te segue e se engaja
Google = quem está ativamente procurando um nutricionista agora

São públicos completamente diferentes. O segundo já chegou decidido que quer consultar — só precisa escolher quem.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Mas pensa: quantas consultas você precisa dar por mês pro site se pagar?

Se sua consulta é R$150, precisa de só 4 consultas. Em um mês. Depois disso, cada paciente novo pelo site é retorno puro.

Parcelamos em 3x sem juros se preferir.`
      },
      {
        texto: "Não sei se terá resultado",
        resposta: `Justo querer garantia!

Posso te mostrar exemplos de nutricionistas em outras cidades que já trabalho, com os dados de visitas e contatos que recebem pelo Google.

E ofereço garantia de resultado em 90 dias — se não trouxer resultado, devolvo.

Quer que eu mande os exemplos agora?`
      }
    ],

    followup_24h: `Oi! Tudo bem?

Pesquisei agora *"nutricionista em {{cidade}}"* no Google. Os primeiros resultados são colegas com site.

Você tem formação e especialização que muitos não têm — mas se não aparecer no Google, pacientes que poderiam ser seus estão indo pra outro.

Posso te mostrar como resolver isso?`,

    followup_48h: `Oi! Sei que agenda de consultório é corrida.

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala. Se não for o momento, tudo bem!`,

    fechamento: `Ótimo! Vamos montar um site que trabalhe por você 🥗

Me manda:
• Foto profissional (fundamental!)
• CRN
• Especialidades/abordagens que trabalha
• Como funciona sua consulta
• Depoimentos de pacientes (pode ser print do Instagram com autorização)
• Valores e formas de atendimento (presencial, online)

Prazo: layout em 3 dias, site no ar em 7 dias.

Como prefere pagar?`,

    dicas: [
      "Nutricionista é muito pessoal — a foto profissional e a bio são fundamentais, mencione isso",
      "Sugira incluir um blog com dicas de nutrição para ranquear no Google naturalmente",
      "Atendimento online é diferencial importante — pergunte se oferece e inclua",
      "Mande mensagem entre 7h-9h antes do dia de consultas começar"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "psicologo": {
    titulo: "Psicólogo / Psicóloga",
    emoji: "🧠",
    dor: "Psicólogos sem site dependem de indicação, perdendo pacientes que buscam no Google.",
    abertura: `Oi! Vi o seu perfil — trabalho muito relevante que você faz 🧠

Me diz: você costuma ter agenda cheia o mês todo, ou às vezes tem horários disponíveis que poderiam ser preenchidos com pacientes novos?`,

    seguimento_positivo: `Faz sentido querer previsibilidade!

Muitos pacientes buscam psicólogo no Google no momento em que decidem pedir ajuda — geralmente numa crise, num momento difícil. Eles pesquisam *"psicólogo em {{cidade}}"* e escolhem pelo que encontram online.

Um site transmite credibilidade profissional e faz o paciente se sentir seguro antes mesmo de ligar.

Posso te mostrar como funcionaria pra você?`,

    proposta: `Para o seu consultório, o site teria:

✅ Apresentação humanizada com foto e CRP
✅ Abordagens terapêuticas que você utiliza (TCC, psicanálise, etc.)
✅ Para quem é indicado o seu atendimento (ansiedade, depressão, relacionamento, etc.)
✅ Como funciona a primeira sessão
✅ Atendimento presencial e/ou online
✅ Formulário de contato discreto (fundamental pra essa área)
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$597*

Um paciente em terapia semanal = R$600-1.000/mês. O site precisa trazer 1 paciente pra se pagar em semanas.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Minha agenda já está cheia",
        resposta: `Que ótimo! Isso mostra a qualidade do seu trabalho.

Mas pensa na lista de espera: quando um paciente encerra, você tem substituto imediato?

Um site garante que você sempre tem pacientes prontos pra entrar. Sem período de agenda vazia entre um e outro.`
      },
      {
        texto: "Não sei se fica bem ter site sendo psicólogo",
        resposta: `Entendo a preocupação com imagem e ética!

O site não precisa ser comercial nem invasivo. Pode ser discreto, acolhedor, informativo — transmitindo exatamente a segurança que o paciente precisa sentir antes de pedir ajuda.

Na verdade, para psicólogos, um site bem feito transmite mais profissionalismo e gera mais confiança do que não ter presença online nenhuma.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Pensando que uma sessão vale R$150-250...

O site precisa trazer só 3-4 sessões pra se pagar. Com um paciente que vira recorrente, isso acontece no primeiro mês.

Parcelamos em 3x sem juros se facilitar.`
      }
    ],

    followup_24h: `Oi! Tudo bem?

Pesquisei *"psicólogo em {{cidade}}"* no Google agora. Os primeiros resultados têm sites simples, mas transmitem credibilidade imediata.

Você tem uma formação e abordagem diferenciada. Mas se não aparecer no Google, quem está buscando ajuda não te encontra.

Posso te ajudar com isso?`,

    followup_48h: `Oi! Sei que consultório tem seu ritmo próprio.

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala. Se não for o momento, tudo bem!`,

    fechamento: `Ótimo! Vamos criar uma presença online que transmita a segurança que seus pacientes precisam sentir.

Me manda:
• Foto profissional (discreta, acolhedora)
• CRP e formação
• Abordagens que trabalha
• Para quem você atende (público, demandas)
• Atendimento presencial e/ou online
• Valor da sessão (ou "consulte")

Prazo: layout em 3 dias, site no ar em 7 dias.

Como prefere pagar?`,

    dicas: [
      "Para psicólogos, o tom do site é fundamental — mencione que será acolhedor, não comercial",
      "O formulário de contato é mais indicado que WhatsApp direto — mais discreto para o paciente",
      "Atendimento online é forte diferencial — pergunte se oferece",
      "Evite horários no início da manhã, prefira entre 12h-14h"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "advogado": {
    titulo: "Advocacia",
    emoji: "⚖️",
    dor: "Clientes buscam advogado no Google no momento da necessidade — sem site você não está lá.",
    abertura: `Oi! Vi o perfil do {{nome}} no Instagram.

Uma pergunta: quando alguém em {{cidade}} precisa urgente de um advogado especializado na sua área, onde você acha que ele busca primeiro?`,

    seguimento_positivo: `Exatamente — é quase sempre o Google.

E a busca por advogado acontece em momento de necessidade real: uma notificação que chegou, uma demissão inesperada, uma separação difícil. A pessoa precisa de resposta agora.

Quem aparece primeiro no Google fica com o cliente. E um único caso pode valer R$1.000 a R$20.000+.

Posso te mostrar como a {{nome}} capturaria esses clientes?`,

    proposta: `Para o escritório {{nome}}, o site teria:

✅ Apresentação das áreas de atuação (trabalhista, cível, família, etc.)
✅ Perfil do advogado com OAB e especialização
✅ Como funciona a consulta inicial
✅ Respostas para dúvidas frequentes (gera confiança e SEO)
✅ Formulário de contato confidencial
✅ Depoimentos de clientes
✅ Otimizado pro Google de {{cidade}} + área de atuação específica

*Investimento: a partir de R$897*

Um caso contratado paga o site com sobra. E o site traz casos todo mês.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Tenho clientes por indicação, não preciso",
        resposta: `Indicação é excelente e demonstra a qualidade do seu trabalho!

Mas tem um limite: você cresce até o tamanho da rede de quem te indica.

O Google não tem limite. Toda pessoa em {{cidade}} que pesquisa sua área de atuação pode virar cliente — mesmo que nunca tenha ouvido falar de você.

São dois canais completamente diferentes. Os dois juntos = escritório sempre com novos casos.`
      },
      {
        texto: "OAB restringe publicidade",
        resposta: `Ótima observação! E é por isso que o site de advogado tem uma abordagem específica.

O site não é publicidade — é informação jurídica e apresentação profissional. Totalmente dentro das normas da OAB.

Conteúdo sobre direitos, explicação de processos, apresentação das áreas de atuação. Isso é permitido e muito eficaz.

Já fiz sites para vários escritórios dentro das normas da OAB. Posso te mostrar os exemplos?`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Vamos ser objetivos:

Qual o honorário médio de um caso na sua área? Mesmo R$2.000 de um caso simples...

O site precisa trazer 1 caso pra se pagar. Com boa posição no Google de {{cidade}}, isso acontece nas primeiras semanas.

Parcelamos em 3x. Faz sentido para o escritório?`
      }
    ],

    followup_24h: `Oi! Tudo bem?

Fiz uma busca agora: *"advogado [sua área] em {{cidade}}"* no Google.

Os primeiros resultados são escritórios com sites. Nenhum transmite o profissionalismo que o {{nome}} tem.

Essa é uma vantagem que você ainda não está aproveitando. Posso te mostrar como mudar isso?`,

    followup_48h: `Oi! Sei que escritório tem ritmo intenso.

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar antes que eu feche com outro, me fala!`,

    fechamento: `Excelente! Escritórios bem posicionados no Google recebem casos qualificados consistentemente.

Me manda:
• Logo do escritório (se tiver)
• OAB e número de registro
• Áreas de atuação principais
• Formação e especializações
• Como funciona a consulta inicial (gratuita ou paga?)
• Depoimentos de clientes (pode ser anônimos)

Prazo: layout em 4 dias, site no ar em 8 dias.

Como prefere pagar?`,

    dicas: [
      "Advogados são muito sensíveis à imagem — mencione que o site será sóbrio e profissional",
      "Conteúdo de dúvidas frequentes ranqueia muito bem no Google — mencione isso como estratégia",
      "Especifique a área de atuação nos argumentos (trabalhista, família, etc.) — aumenta relevância",
      "Mande mensagem entre 14h-16h, após o horário de audiências matutinas"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "imobiliaria": {
    titulo: "Imobiliária / Corretor",
    emoji: "🏠",
    dor: "Compradores e locatários pesquisam imóveis online — sem site você perde negócios todo dia.",
    abertura: `Oi! Vi o trabalho da {{nome}} no Instagram — ótimos imóveis!

Me diz: quando alguém está buscando imóvel em {{cidade}}, qual é o primeiro lugar que você acha que ele pesquisa?`,

    seguimento_positivo: `Exatamente — sites de imóveis e Google primeiro, depois indicação.

E quem aparece no Google com site próprio tem uma vantagem enorme: transmite credibilidade antes mesmo do primeiro contato.

Uma imobiliária com site bem feito fecha 30-40% mais negócios porque o cliente já chega "aquecido" — ele viu os imóveis, viu o portfólio, já decidiu que confia.

Posso te mostrar como funcionaria pra {{nome}}?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Portfólio de imóveis disponíveis com fotos e descrição
✅ Filtro por tipo, valor, bairro
✅ Formulário de contato e visita agendada
✅ Perfil dos corretores
✅ Depoimentos de clientes que já fecharam
✅ Calculadora de financiamento (diferencial!)
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$997*

Uma comissão de R$5.000+ paga o site com sobra. E o site traz leads todo mês.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já uso Zap Imóveis e OLX",
        resposta: `Ótimo! Zap e OLX são portais de grande tráfego.

Mas pensa: nesses portais você compete com centenas de anúncios. O cliente compara preço e vai pro mais barato.

No seu próprio site, você é o único. O cliente vê seu portfólio, seus corretores, seus depoimentos — e escolhe trabalhar com você pela confiança, não pelo preço.

Os portais trazem volume, o site traz qualidade. Os dois juntos é a estratégia perfeita.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Mas vamos ser diretos:

Qual a sua comissão média por negócio fechado? R$3.000? R$5.000? R$10.000?

O site precisa gerar 1 negócio fechado pra se pagar. Com boa posição no Google de {{cidade}}, 1 lead qualificado por mês é meta muito conservadora.

Parcelamos em 3x. Faz sentido?`
      },
      {
        texto: "Meu catálogo muda muito",
        resposta: `Sem problema! O site que eu faço é fácil de atualizar.

Você mesmo pode adicionar e remover imóveis — é simples como postar no Instagram. Sem depender de técnico.

Ou se preferir, me manda as atualizações e eu faço — sem custo extra.`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Pesquisei *"imobiliária em {{cidade}}"* no Google agora. Os primeiros resultados são imobiliárias com sites.

Você tem imóveis e experiência — mas sem site, o cliente que pesquisa no Google não te encontra.

Posso te mostrar como mudar isso essa semana?`,

    followup_48h: `Oi! Sei que corretor vive no campo.

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala!`,

    fechamento: `Ótimo! Imobiliárias com boa presença online fecham mais e melhor.

Me manda:
• Logo e cores da imobiliária
• CRECI
• Lista dos imóveis disponíveis com fotos e descrição
• Perfil dos corretores
• Depoimentos de clientes
• Especialidade (venda, locação, comercial, residencial)

Prazo: layout em 5 dias, site no ar em 10 dias.

Como prefere pagar?`,

    dicas: [
      "Calculadora de financiamento é um diferencial que poucos têm — mencione como destaque",
      "Peça fotos profissionais dos imóveis — faz enorme diferença na conversão",
      "Integração com WhatsApp direto para cada imóvel é muito eficaz",
      "Mande mensagem no início da semana, quando corretores estão planejando"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "pizzaria": {
    titulo: "Pizzaria / Hamburgueria",
    emoji: "🍕",
    dor: "Clientes pesquisam 'pizzaria delivery em [cidade]' no Google — sem site você perde pedidos.",
    abertura: `Oi! Vi o cardápio da {{nome}} no Instagram — tá de dar água na boca! 🍕

Me diz: vocês recebem mais pedidos pelo iFood/Rappi ou pelo WhatsApp direto?`,

    seguimento_positivo: `Faz sentido! WhatsApp direto = sem taxa de plataforma = mais lucro.

E um site com cardápio online e botão de pedido direto no WhatsApp faz exatamente isso: atrai clientes pelo Google e manda direto pro WhatsApp de vocês, sem intermediário, sem taxa.

Além de aparecer quando pesquisam *"pizzaria em {{cidade}}"* ou *"delivery em {{cidade}}"*.

Posso te mostrar como ficaria?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Cardápio completo com fotos profissionais e preços
✅ Botão "Fazer Pedido" direto pro WhatsApp
✅ Área de cobertura de entrega
✅ Horário de funcionamento
✅ Promoções e combos em destaque
✅ Avaliações de clientes
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$547*

Se trouxer só 5 pedidos extras por semana = 20 pedidos/mês a R$50 médio = R$1.000 extras. O site se paga em menos de 1 mês.

E sem pagar taxa pra plataforma em nenhum pedido.

Quer uma prévia?`,

    objecoes: [
      {
        texto: "Já estou no iFood",
        resposta: `Ótimo! iFood traz volume.

Mas pensa: no iFood você paga 12-30% de taxa por pedido, compete com dezenas de pizzarias e não tem contato direto com o cliente.

Com o site, o cliente encontra você pelo Google e pede direto no WhatsApp. Zero taxa, zero concorrente ao lado, você fica com o contato do cliente pra fidelizar.

Os dois canais juntos = mais pedidos + mais lucro por pedido.`
      },
      {
        texto: "Tá caro",
        resposta: `Vamos fazer a conta rápida:

Você paga quanto de taxa pro iFood por mês? R$300? R$500? Mais?

O site custa menos que 2 meses de taxa de plataforma e dura para sempre. E cada pedido que vem pelo site tem lucro 100% seu.

Parcelamos em 3x se preferir.`
      },
      {
        texto: "Não tenho fotos do cardápio",
        resposta: `Sem problema! Tenho duas opções:

1. Usamos fotos de banco de imagens (tem fotos belíssimas de pizza, burger, etc.) pra começar
2. Posso indicar um fotógrafo parceiro em {{cidade}} que faz food photo a um custo bem acessível

No segundo caso, o investimento em foto se paga rapidíssimo porque comida boa fotografada vende muito mais.`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Pesquisei *"pizzaria delivery {{cidade}}"* no Google agora. Os primeiros resultados são concorrentes com site.

A {{nome}} tem um cardápio incrível — mas quem pesquisa delivery no Google não te encontra.

Posso te mostrar como isso mudaria com um site?`,

    followup_48h: `Oi! Sei que cozinha de pizzaria não para! 🔥

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser garantir antes que eu feche com outro, me fala!`,

    fechamento: `Bora! Site de delivery bem feito traz pedido desde o primeiro dia.

Me manda:
• Logo e cores da pizzaria
• Cardápio completo com preços
• Fotos dos produtos (se tiver — se não, a gente resolve)
• Área de entrega
• Horário de funcionamento
• Promoções atuais

Prazo: layout em 2 dias, site no ar em 5 dias.

PIX ou parcelado?`,

    dicas: [
      "Mencione a economia de taxa de iFood como argumento financeiro forte",
      "Fotos de comida são decisivas para conversão — priorize esse ponto",
      "Sugira promoções de sexta e fim de semana no site para criar urgência",
      "Mande mensagem entre 14h-16h, antes do rush do jantar"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "oficina mecanica": {
    titulo: "Oficina Mecânica",
    emoji: "🔧",
    dor: "Motoristas pesquisam oficina no Google na hora do aperto — sem site você fica de fora.",
    abertura: `Oi! Vi a {{nome}} no Instagram.

Me diz: quando um motorista tem um problema no carro em {{cidade}} e não conhece nenhuma oficina, o que você acha que ele faz primeiro?`,

    seguimento_positivo: `Exato — ele abre o Google na hora.

E em momento de aperto, o motorista vai pra primeira oficina que aparece com boas avaliações. Não tem tempo de perguntar pra todo mundo.

A {{nome}} com um site bem posicionado captura exatamente esse cliente: o que precisa agora e está disposto a pagar bem por um serviço de confiança.

Posso te mostrar como ficaria?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Lista de serviços (revisão, freio, suspensão, elétrica, etc.)
✅ Marcas e modelos que atendem
✅ Avaliações de clientes (fator decisivo!)
✅ Fotos da oficina e equipe
✅ Botão "Chamar no WhatsApp" em destaque
✅ Localização no mapa
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$547*

Uma revisão completa ou reparo médio = R$300-800. O site precisa trazer 1 cliente novo pra se pagar.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Tenho clientes fixos que me indicam",
        resposta: `Ótimo! Clientes que indicam são os melhores.

Mas tem um público que você ainda não está alcançando: motoristas novos em {{cidade}}, motoristas que o carro quebrou longe de casa, motoristas que querem uma segunda opinião.

Esses clientes pesquisam no Google na hora do aperto. Se a {{nome}} aparecer, você pega esse cliente. Se não aparecer, vai pra concorrente.`
      },
      {
        texto: "Tá caro pra mim agora",
        resposta: `Entendo! Mas pensa: um cliente que faz revisão anual + pequenos reparos vale R$1.000-2.000/ano.

O site precisa trazer 1 cliente assim pra se pagar com sobra.

E parcelamos em 3x sem juros se facilitar a entrada.`
      },
      {
        texto: "Não sei mexer com internet",
        resposta: `Você não precisa! Eu cuido de tudo.

O site sobe, fica no ar e funciona sozinho. Se precisar atualizar preço ou serviço, você me fala e eu faço — sem custo extra.

Sua única função é atender os clientes que chegarem.`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Pesquisei *"oficina mecânica em {{cidade}}"* no Google agora. Os primeiros resultados são oficinas com site e avaliações.

A {{nome}} tem qualidade — mas quem está com problema no carro agora em {{cidade}} não te encontra.

Posso te mostrar como mudar isso?`,

    followup_48h: `Oi! Sei que oficina é correria o dia todo 🔧

Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala!`,

    fechamento: `Ótimo! Oficinas com site bem posicionado no Google sempre têm movimento.

Me manda:
• Logo (se tiver)
• Lista de serviços que faz
• Marcas que atende
• Fotos da oficina e equipe
• Horários e endereço
• Avaliações do Google Maps (se tiver)

Prazo: layout em 3 dias, site no ar em 7 dias.

Como prefere pagar?`,

    dicas: [
      "Avaliações no Google Maps são fator decisivo para mecânica — sugira que peça avaliações aos clientes",
      "Especialidade em determinadas marcas (BMW, Fiat, Honda) ranqueia bem no Google",
      "Botão de WhatsApp proeminente é essencial — cliente quer resposta rápida",
      "Mande mensagem entre 8h-9h antes do movimento da oficina começar"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "loja de suplementos": {
    titulo: "Loja de Suplementos",
    emoji: "💊",
    dor: "Consumidores de suplementos pesquisam produtos e lojas no Google antes de comprar.",
    abertura: `Oi! Vi a {{nome}} no Instagram — ótimo mix de produtos 💪

Me diz: a maioria das suas vendas é pra quem já te conhece ou você gostaria de alcançar quem pesquisa suplementos no Google em {{cidade}}?`,

    seguimento_positivo: `Faz sentido! E o público de suplementos é muito ativo no Google.

Eles pesquisam *"loja de suplementos em {{cidade}}"*, *"whey protein em {{cidade}}"*, *"creatina com entrega em {{cidade}}"*...

Um site bem posicionado captura esse público com intenção de compra imediata. E cliente de suplemento é recorrente — volta todo mês.

Posso te mostrar como a {{nome}} apareceria nessas buscas?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Catálogo de produtos com fotos e preços
✅ Filtro por categoria (proteína, pré-treino, vitamina, etc.)
✅ Botão de compra/consulta direto no WhatsApp
✅ Blog com dicas de suplementação (ranqueia no Google!)
✅ Depoimentos e resultados de clientes
✅ Promoções em destaque
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$647*

Um cliente fiel de suplementos compra R$200-500/mês. O site precisa trazer 1 pra se pagar.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já vendo pelo Instagram e WhatsApp",
        resposta: `Ótimo! Mas pensa no público que você não está alcançando:

Quem pesquisa *"loja de suplementos em {{cidade}}"* no Google geralmente não segue seu Instagram — ele quer comprar agora e está comparando opções.

Se a {{nome}} não aparece, ele compra de quem aparece. E você nunca vai saber que perdeu esse cliente.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Vamos calcular:

Ticket médio de uma compra na {{nome}}? R$150? R$200?

O site precisa trazer 3-4 clientes novos pra se pagar. Com boa posição no Google de {{cidade}}, isso acontece em semanas.

E cliente de suplemento volta todo mês — então é retorno recorrente.

Parcelamos em 3x. Faz sentido?`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Pesquisei *"suplementos em {{cidade}}"* no Google. Os primeiros resultados são lojas com site.

Você tem produtos ótimos — mas quem pesquisa no Google não te encontra.

Posso te mostrar como mudar isso?`,

    followup_48h: `Oi! Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala 💊`,

    fechamento: `Bora! Lojas de suplemento com site ranqueiam muito bem no Google.

Me manda:
• Logo e cores da loja
• Catálogo de produtos principais com preços
• Fotos dos produtos
• Promoções atuais
• Horários (se loja física) ou info de entrega

Prazo: layout em 3 dias, site no ar em 7 dias.

Como prefere pagar?`,

    dicas: [
      "Blog com dicas de suplementação ranqueia muito bem — mencione como estratégia de SEO",
      "Público de academia é fiel e recorrente — use o argumento de recorrência",
      "Entrega é diferencial importante — pergunte se faz e inclua no site",
      "Mande mensagem entre 16h-18h, depois do treino — público mais receptivo"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "buffet infantil": {
    titulo: "Buffet Infantil",
    emoji: "🎉",
    dor: "Pais pesquisam buffet infantil no Google meses antes da festa — sem site você perde reservas.",
    abertura: `Oi! Vi as festas incríveis da {{nome}} no Instagram — que estrutura linda! 🎉

Me diz: as reservas de vocês costumam encher com quantos meses de antecedência?`,

    seguimento_positivo: `Faz sentido! E sabe como a maioria dos pais começa a pesquisar?

Eles abrem o Google e digitam *"buffet infantil em {{cidade}}"*. Veem fotos, preços, avaliações — e ligam pra quem tem as melhores informações.

Um site bem feito pode garantir que a {{nome}} apareça nessa busca e converta o clique em reserva.

Posso te mostrar como funcionaria?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Galeria de festas realizadas (o maior gatilho de venda)
✅ Pacotes e preços detalhados
✅ Capacidade, estrutura e diferenciais
✅ Formulário de orçamento/reserva
✅ Depoimentos e avaliações de pais
✅ Fotos do espaço e decorações temáticas
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$697*

Uma reserva = R$2.000 a R$8.000. O site se paga na primeira reserva gerada.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já temos agenda cheia",
        resposta: `Que ótimo! Isso mostra a qualidade da {{nome}}.

Mas pensa: nos meses de baixa temporada (fevereiro, julho)? E se quiser abrir um segundo espaço no futuro?

Um site garante lista de espera sempre cheia e posicionamento de longo prazo no Google de {{cidade}}.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Mas vamos ser diretos:

Uma festa reservada = R$3.000 em média. O site precisa trazer 1 reserva pra se pagar.

Com as fotos e decorações lindas que a {{nome}} tem, o site vai converter muito bem.

Parcelamos em 3x.`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Pesquisei *"buffet infantil em {{cidade}}"* no Google. Os primeiros resultados têm sites com galerias de festas.

As fotos da {{nome}} no Instagram são lindas — imagina elas num site bem feito no Google?

Posso te mostrar como ficaria?`,

    followup_48h: `Oi! Sei que véspera de festa é loucura. Tenho uma abertura pra mais um projeto em {{cidade}} essa semana — se quiser conversar, me fala! 🎂`,

    fechamento: `Ótimo! Buffets com site bem feito enchem a agenda com antecedência.

Me manda:
• Logo e cores do buffet
• Fotos das festas (quanto mais, melhor!)
• Pacotes e preços
• Capacidade e estrutura
• Decorações temáticas disponíveis
• Depoimentos de clientes

Prazo: layout em 4 dias, site no ar em 8 dias.

Como prefere pagar?`,

    dicas: [
      "Galeria de festas é o maior gatilho — mencione que vai organizar por tema",
      "Depoimentos de pais felizes convertem muito — pergunte se tem",
      "Épocas de pico (outubro-dezembro) têm muito mais busca — tente fechar antes",
      "Mande mensagem segunda ou terça, quando agenda do buffet está sendo planejada"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "lava jato": {
    titulo: "Lava Jato",
    emoji: "🚗",
    dor: "Motoristas pesquisam lava jato no Google quando precisam — sem site você fica invisível.",
    abertura: `Oi! Vi o {{nome}} no Instagram.

Pergunta rápida: quando um motorista precisa lavar o carro em {{cidade}} e não conhece nenhum lugar, o que você acha que ele faz?`,

    seguimento_positivo: `Exato — abre o Google na hora.

E o interessante é que cliente de lava jato é recorrente: vem toda semana ou quinzena. Um único cliente fiel vale R$200-400/mês, todo mês.

Um site bem posicionado no Google de {{cidade}} pode trazer vários desses clientes novos por mês.

Posso te mostrar como ficaria pra {{nome}}?`,

    proposta: `Para o {{nome}}, o site teria:

✅ Tabela de serviços e preços (lavagem simples, completa, polimento, etc.)
✅ Fotos do espaço e carros sendo lavados
✅ Agendamento direto no WhatsApp
✅ Avaliações de clientes
✅ Localização e horários
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$497*

Um cliente que vem 2x por mês a R$40 = R$960/ano. O site precisa trazer 1 cliente assim pra se pagar.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já tenho clientes fixos",
        resposta: `Ótimo! E vai continuar tendo — mais ainda.

Mas e os motoristas novos em {{cidade}}? Os que estão passando e precisam de uma lavagem rápida? Os que estão insatisfeitos com o lava jato atual?

Esses pesquisam no Google. Se a {{nome}} não aparece, vai pra concorrente.`
      },
      {
        texto: "Tá caro pra mim",
        resposta: `Entendo! Vamos calcular:

Lavagem simples a R$25. O site precisa trazer 20 lavagens pra se pagar. Em um mês, se trouxer 1 cliente novo por semana, já se pagou.

Parcelamos em 3x sem juros. Faz sentido?`
      }
    ],

    followup_24h: `Oi {{nome}}! Pesquisei *"lava jato em {{cidade}}"* no Google — os primeiros têm site. Você aparece?

Posso te mostrar como mudar isso essa semana!`,

    followup_48h: `Oi! Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala 🚗`,

    fechamento: `Bora! Site de lava jato bem feito traz cliente novo toda semana.

Me manda: logo, tabela de serviços e preços, fotos do espaço, horários. Prazo: 5 dias no ar.

PIX ou parcelado em 3x?`,

    dicas: [
      "Tabela de preços clara é fundamental — cliente de lava jato quer saber o preço antes",
      "Agendamento online reduz filas e aumenta satisfação — mencione como diferencial",
      "Avaliações no Google Maps são decisivas — sugira pedir para clientes avaliarem",
      "Mande mensagem sábado de manhã, quando dono está no lava jato e menos ocupado"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "escola de idiomas": {
    titulo: "Escola de Idiomas",
    emoji: "🌎",
    dor: "Alunos pesquisam cursos de idiomas no Google — escola sem site perde matrículas.",
    abertura: `Oi! Vi o perfil da {{nome}} no Instagram.

Me diz: quando alguém quer aprender inglês em {{cidade}}, onde você acha que ele começa a pesquisar?`,

    seguimento_positivo: `Exato — Google primeiro.

E a decisão de fazer um curso de idiomas é racional: a pessoa compara metodologia, preços, localização e depoimentos. Tudo isso precisa estar num site pra você não perder para a escola que tem.

Uma matrícula de R$200-400/mês = R$2.400-4.800/ano. O site precisa trazer 1 aluno pra se pagar.

Posso te mostrar como funcionaria pra {{nome}}?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Apresentação dos idiomas e cursos disponíveis
✅ Metodologia e diferenciais
✅ Perfil dos professores
✅ Horários e turmas disponíveis
✅ Depoimentos de alunos (idealmente em vídeo)
✅ Formulário de aula experimental gratuita
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$647*

Um aluno por 1 ano = R$3.000+. O site se paga com 1 matrícula.

Quer uma prévia?`,

    objecoes: [
      {
        texto: "Já tenho alunos por indicação",
        resposta: `Ótimo! E o Google vai multiplicar isso.

Quem pesquisa curso de idiomas no Google está tomando a decisão de estudar agora. Esse público é muito diferente de quem recebe uma indicação casual.

É um público com intenção imediata. O site captura exatamente esses alunos.`
      },
      {
        texto: "Concorro com CNA, Wizard...",
        resposta: `Essa é a sua maior vantagem!

Você é local, pode oferecer atenção personalizada, turmas menores, professor que conhece o aluno pelo nome.

O site destaca exatamente isso: a experiência que o aluno tem numa escola local, que as franquias não oferecem.

Muita gente prefere escola local justamente por isso — mas só descobre se aparecer no Google.`
      }
    ],

    followup_24h: `Oi {{nome}}! Pesquisei *"curso de inglês em {{cidade}}"* no Google. Os primeiros resultados são escolas com site.

Você tem metodologia e professores que as grandes franquias não têm — mas quem pesquisa não te encontra.

Posso te mostrar como mudar isso?`,

    followup_48h: `Oi! Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala 🌎`,

    fechamento: `Ótimo! Escolas de idiomas com site bem feito enchem turmas rapidamente.

Me manda: logo, idiomas e cursos, metodologia, professores, horários disponíveis e depoimentos.

Prazo: 7 dias no ar. PIX ou parcelado em 3x?`,

    dicas: [
      "Oferta de aula experimental gratuita é CTA muito eficaz para escola de idiomas",
      "Depoimentos em vídeo de alunos convertem muito mais que texto",
      "Mencione que pode ranquear para 'inglês para crianças', 'inglês para negócios', etc.",
      "Mande mensagem segunda de manhã, quando donos estão planejando a semana"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "personal trainer": {
    titulo: "Personal Trainer",
    emoji: "🏋️",
    dor: "Clientes buscam personal trainer no Google — sem site você perde para quem aparece.",
    abertura: `Oi! Vi seu perfil no Instagram — resultados incríveis dos seus alunos 💪

Me diz: você consegue novos alunos de forma previsível, ou ainda depende muito de indicação e quando o Instagram engaja?`,

    seguimento_positivo: `Faz sentido! E o problema de depender só de indicação é a imprevisibilidade.

Um site muda isso: toda vez que alguém pesquisa *"personal trainer em {{cidade}}"*, você aparece. Seja segunda ou domingo, de manhã ou à noite.

E cliente de personal é recorrente — R$400-800/mês, todo mês, por meses ou anos.

Posso te mostrar como funcionaria?`,

    proposta: `Para você, o site teria:

✅ Apresentação com foto, CREF e especializações
✅ Metodologia de treino
✅ Transformações dos alunos (antes/depois)
✅ Modalidades (musculação, funcional, emagrecimento, etc.)
✅ Atendimento presencial e/ou online
✅ Formulário de aula experimental
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$547*

1 aluno novo a R$500/mês = 12 meses = R$6.000. O site se paga na primeira semana do primeiro aluno.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já tenho alunos suficientes",
        resposta: `Ótimo! Mas pensa na rotatividade natural: alunos que viajam, mudam de horário, pausam por algum motivo.

Um site garante que você tem fila de espera sempre. Nunca mais fica com horário vago na semana.`
      },
      {
        texto: "Tá caro",
        resposta: `1 aluno novo paga o site e sobra. Parcelamos em 3x. Faz sentido?`
      }
    ],

    followup_24h: `Oi! Pesquisei *"personal trainer em {{cidade}}"* — os primeiros têm site. Você tem transformações que eles não têm. Posso te mostrar como aparecer lá?`,

    followup_48h: `Oi! Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala 🏋️`,

    fechamento: `Bora! Personal trainers com site bem feito nunca ficam com horário vago.

Me manda: foto profissional, CREF, especializações, metodologia, antes/depois dos alunos, valores.

Prazo: 5 dias no ar. Como prefere pagar?`,

    dicas: [
      "Antes/depois dos alunos é o maior gatilho de vendas — seja insistente nisso",
      "Atendimento online dobra o alcance — pergunte se oferece",
      "CREF em destaque gera muita credibilidade",
      "Mande mensagem entre 6h-7h ou 20h-21h, horários de menor intensidade de treino"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "escritorio de contabilidade": {
    titulo: "Escritório de Contabilidade",
    emoji: "📊",
    dor: "Empresários pesquisam contador no Google — sem site você perde clientes que pagam bem.",
    abertura: `Oi! Vi o {{nome}} no Instagram.

Me diz: quando um empresário abre uma empresa em {{cidade}} e precisa de contador, onde você acha que ele busca?`,

    seguimento_positivo: `Exato — Google primeiro.

E cliente de contabilidade é o melhor tipo: recorrente, contrato mensal, ticket médio alto (R$300-2.000/mês por empresa) e raramente troca de contador quando está satisfeito.

Um site bem posicionado no Google de {{cidade}} pode trazer 2-3 novos clientes por mês.

Posso te mostrar como ficaria pra {{nome}}?`,

    proposta: `Para o {{nome}}, o site teria:

✅ Serviços oferecidos (abertura de empresa, contabilidade, RH, fiscal, etc.)
✅ Especialidades por tipo de empresa (MEI, ME, SA, etc.)
✅ Diferenciais do escritório
✅ Perfil dos contadores com CRC
✅ Depoimentos de clientes
✅ Formulário de contato e consultoria gratuita
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$797*

Um cliente novo a R$500/mês = R$6.000/ano. O site se paga em menos de 2 meses do primeiro cliente.

Quer ver uma prévia?`,

    objecoes: [
      {
        texto: "Já tenho clientes suficientes",
        resposta: `Que ótimo! Mas pensa na rotatividade: empresas que fecham, clientes que mudam de cidade...

Um site garante fluxo contínuo de novos clientes. E quando você quiser crescer a equipe e escalar o escritório, já tem a base digital pra isso.`
      },
      {
        texto: "Tá caro",
        resposta: `1 cliente novo a R$500/mês paga o site em menos de 2 meses. Parcelamos em 3x. Faz sentido?`
      }
    ],

    followup_24h: `Oi {{nome}}! Pesquisei *"contabilidade em {{cidade}}"* — os primeiros têm site. Você está perdendo clientes que pagam mensalidade fixe. Posso te mostrar como resolver isso?`,

    followup_48h: `Oi! Tenho uma abertura pra mais um projeto em {{cidade}} essa semana. Se quiser conversar, me fala 📊`,

    fechamento: `Ótimo! Escritórios de contabilidade com site atraem clientes de qualidade pelo Google.

Me manda: logo, CRC, serviços, especializações, depoimentos, diferenciais. Prazo: 7 dias no ar.

Como prefere pagar?`,

    dicas: [
      "Especialização em algum segmento (restaurantes, e-commerce, etc.) ranqueia muito bem",
      "Abertura de empresa é um serviço muito buscado no Google — destaque isso",
      "Consultoria gratuita como CTA funciona muito bem para contabilidade",
      "Mande mensagem segunda ou terça de manhã"
    ]
  },

  // ─────────────────────────────────────────────────────────────────
  "_default": {
    titulo: "Negócio Local",
    emoji: "🚀",
    dor: "Clientes pesquisam no Google antes de escolher — sem site você perde para quem aparece.",
    abertura: `Oi! Vi o perfil da {{nome}} no Instagram — trabalho incrível de vocês!

Me diz uma coisa: quando alguém em {{cidade}} pesquisa por {{segmento}} no Google, vocês aparecem nos primeiros resultados?`,

    seguimento_positivo: `Faz sentido! E esse é exatamente o ponto.

Hoje, antes de qualquer decisão de compra, o cliente pesquisa no Google. Quem aparece primeiro — com boas informações, fotos e avaliações — fica com o cliente.

Um site bem posicionado pode ser a diferença entre ter agenda cheia e perder clientes todo dia sem saber.

Posso te mostrar como ficaria pra {{nome}}?`,

    proposta: `Para a {{nome}}, o site teria:

✅ Página profissional com seus serviços e diferenciais
✅ Galeria de fotos do seu trabalho
✅ Depoimentos de clientes
✅ Botão direto pro WhatsApp
✅ Localização e horários
✅ Otimizado pro Google de {{cidade}}

*Investimento: a partir de R$547*

O site precisa trazer apenas 1-2 clientes novos pra se pagar. Depois disso, é retorno puro todo mês.

Quer ver uma prévia de como ficaria?`,

    objecoes: [
      {
        texto: "Já tenho Instagram",
        resposta: `Instagram é ótimo pra quem já te segue!

Mas quem pesquisa no Google nunca ouviu falar de você. São dois públicos completamente diferentes.

O site captura quem está buscando ativamente. O Instagram mantém quem já é cliente. Os dois juntos = negócio crescendo por dois caminhos ao mesmo tempo.`
      },
      {
        texto: "Tá caro",
        resposta: `Entendo! Mas vamos fazer a conta:

Quanto vale 1 novo cliente pra você? Mesmo R$200...

O site precisa trazer 3 clientes novos pra se pagar. Com boa posição no Google de {{cidade}}, isso acontece no primeiro mês.

E parcelamos em até 3x sem juros. Faz sentido?`
      },
      {
        texto: "Não tenho tempo",
        resposta: `Você não precisa fazer nada! Eu cuido de tudo.

Me passa as informações básicas (15 minutos), eu monto o site em 3-5 dias e você aprova.

Depois que está no ar, funciona sozinho 24h por dia. Sem precisar postar, sem precisar atualizar, sem precisar fazer nada.`
      },
      {
        texto: "Vou pensar",
        resposta: `Claro! Me diz o que você quer avaliar — preço, prazo, resultado?

Posso te mostrar cases de negócios similares em outras cidades e os resultados que estão tendo.

Enquanto você pensa, seu concorrente que já tem site está aparecendo no Google agora. Qual é a maior dúvida que eu posso tirar pra te ajudar a decidir?`
      },
      {
        texto: "Já tentei antes e não funcionou",
        resposta: `Boa de saber! Me conta o que aconteceu?

Na maioria dos casos o site não funciona por dois motivos: foi feito sem otimização pro Google (ninguém achava), ou era muito difícil de usar no celular.

O que eu faço é diferente: site simples, rápido, feito especificamente pra aparecer no Google e converter visitante em cliente pelo WhatsApp.

Posso te mostrar a diferença na prática?`
      }
    ],

    followup_24h: `Oi {{nome}}! Tudo bem?

Só passando pra saber se você teve chance de pensar na conversa de ontem sobre o site.

Pesquisei agora *"{{segmento}} em {{cidade}}"* no Google — vi quem está aparecendo nos primeiros resultados. São seus concorrentes diretos.

Posso te mandar um print mostrando a diferença?`,

    followup_48h: `Oi! Sei que a rotina é corrida.

Tenho uma abertura pra mais 1 projeto em {{cidade}} essa semana.

Se quiser garantir antes que eu feche com outro, me fala. Se não for o momento certo, sem problema — fica o contato pra quando precisar!`,

    fechamento: `Ótimo! Vamos começar.

Próximos passos simples:
1️⃣ Me manda: logo (se tiver), fotos do trabalho/produto, lista de serviços/produtos com preços, endereço e horários
2️⃣ Em 3 dias úteis monto o layout e te mando pra aprovar
3️⃣ Você aprova (ou pede ajustes — sem limite de revisões)
4️⃣ Em até 7 dias o site está no ar e aparecendo no Google

Pagamento: PIX (5% de desconto) ou parcelado em até 3x no cartão.

Qual você prefere?`,

    dicas: [
      "Mande a mensagem de abertura às 10h ou 14h — horário de maior receptividade",
      "Personalize com o nome do negócio e da cidade para parecer pesquisado, não spam",
      "Se o Instagram tiver poucas curtidas, argumente que o Google não depende de algoritmo",
      "Primeira mensagem curta e com pergunta — faça o lead responder antes de apresentar"
    ]
  }
};

// Mapeamento de segmentos da base para as chaves dos scripts
const SEGMENTO_MAP = {
  "barbearia": "barbearia",
  "barber": "barbearia",
  "barbeiro": "barbearia",
  "salao": "salao de beleza",
  "salão": "salao de beleza",
  "beleza": "salao de beleza",
  "estetica": "clinica estetica",
  "estética": "clinica estetica",
  "clinica estetica": "clinica estetica",
  "academia": "academia",
  "gym": "academia",
  "fitness": "academia",
  "crossfit": "academia",
  "pet": "pet shop",
  "petshop": "pet shop",
  "veterinari": "pet shop",
  "odontolog": "clinica odontologica",
  "dentist": "clinica odontologica",
  "nutri": "nutricionista",
  "psicolog": "psicologo",
  "advogad": "advogado",
  "advocacia": "advogado",
  "juridic": "advogado",
  "contabil": "escritorio de contabilidade",
  "contabilidade": "escritorio de contabilidade",
  "imobi": "imobiliaria",
  "imóvel": "imobiliaria",
  "corretor": "imobiliaria",
  "pizza": "pizzaria",
  "hamburgu": "pizzaria",
  "burger": "pizzaria",
  "lanche": "pizzaria",
  "delivery": "pizzaria",
  "oficina": "oficina mecanica",
  "mecanic": "oficina mecanica",
  "automovel": "oficina mecanica",
  "lava": "lava jato",
  "suplemento": "loja de suplementos",
  "whey": "loja de suplementos",
  "buffet": "buffet infantil",
  "festa": "buffet infantil",
  "decoracao": "buffet infantil",
  "idioma": "escola de idiomas",
  "ingles": "escola de idiomas",
  "inglês": "escola de idiomas",
  "musica": "escola de idiomas",
  "personal": "personal trainer",
  "trainer": "personal trainer",
};

function getScript(segmento) {
  if (!segmento) return SCRIPTS_VENDAS["_default"];
  const seg = segmento.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  // Busca exata
  if (SCRIPTS_VENDAS[seg]) return SCRIPTS_VENDAS[seg];
  // Busca por mapeamento parcial
  for (const [key, val] of Object.entries(SEGMENTO_MAP)) {
    if (seg.includes(key)) return SCRIPTS_VENDAS[val] || SCRIPTS_VENDAS["_default"];
  }
  return SCRIPTS_VENDAS["_default"];
}

function preencherVariaveis(texto, lead) {
  const nome     = lead.nome || lead.razao_social || lead.nome_fantasia || "vocês";
  const cidade   = lead.cidade || lead.municipio_nome || "sua cidade";
  const segmento = lead.segmento || lead.cnae_descricao || "seu negócio";
  const instagram = lead.instagram_url || lead.instagram || "";
  return texto
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{cidade\}\}/g, cidade)
    .replace(/\{\{segmento\}\}/g, segmento)
    .replace(/\{\{instagram\}\}/g, instagram);
}
