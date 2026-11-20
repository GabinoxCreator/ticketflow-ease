/*
 * Conteúdo da página do Fogo & Fumaça Festival (OS-444, 19/11/2026).
 *
 * Só baixa na página do evento do Fogo (vem junto do componente `BlocosDoEvento`,
 * carregado sob demanda). Montado por nós, no código, só para este evento (decisão do
 * Gabriel, 18/11: "é só nós que montamos aqui").
 *
 * ⚠️ Regra de conteúdo: só entra o que tem fonte escrita da organização. Nada
 * inventado: nome, prato, marca, logo, horário ou atração sem fonte fica de fora até
 * chegar. Sem travessão; nenhuma foto gerada por IA; onde há bebida alcoólica vai o
 * aviso de 18 anos.
 *
 * FONTES
 * - Data, horário (12h às 21h), 18+ sem menores e sem Área Kids, setores e endereço:
 *   cadastro do evento no banco (o texto do "Sobre o evento", que esta parte
 *   substitui na página do Fogo por decisão do Gabriel de 19/11).
 * - Estações (pratos), open bar e diferenciais de Premium e VIP: flyer da organização
 *   para a gráfica, mandado pela Patrícia em 17/11 ("Design sem nome (1).pdf").
 * - Patagônia e Spaten no VIP: Patrícia na call de 16/11
 *   (`_docs/apresentacao/fogo-e-fumaca/anuncios/registro.md`); o Gabriel decidiu em
 *   18/11 manter todas as marcas da call.
 * - Assador de cada prato: perfil do festival no Instagram, lido em 10/11
 *   (`_docs/apresentacao/fogo-e-fumaca/instagram/v2/direcao.md`). Ancho, Chorizo e
 *   Tulipa de frango: a Thaís escreveu ao Gabriel em 19/11 às 17h43 ("ancho, carol
 *   armenio", "tulipa, Marcelo Paranhos", "chorizo - Rogerinho").
 * - Shows: flyer "SHOWS" da Thaís (18/11, publicado no perfil do festival). As fotos
 *   das bandas são as que a Thaís mandou ao Gabriel em 19/11 às 17h40 (originais em
 *   `_docs/os444/material-thais/`): Red Fox é foto de estúdio; Valter Jr e Vinícius e
 *   Rafael Cuba são as artes oficiais deles, sem o letreiro; The Horses veio recortada
 *   em fundo branco e foi para o fundo escuro. Nenhuma é de IA. Na arte do Rafael Cuba
 *   ele é quem está na frente, no centro, com o nome em cima.
 * - Logo do festival: arquivo oficial mandado pela Thaís em 19/11 às 17h37 (fundo
 *   branco tirado por nós).
 * - "Mais de 10 estações" e "9 horas de open bar e open food": vídeos da Thaís (19/11).
 * - Patrocinadores e parceiros: as 5 artes da Thaís no grupo (18/11), na ordem dela;
 *   o título vem do flyer da organização. Logos recortadas dessas artes.
 * - Fotos do open food (o quadro de três): baixadas em 17/11 do Instagram da
 *   Churrascada, a pedido do Gabriel (`_docs/apresentacao/fogo-e-fumaca/
 *   referencias-churrascada/fotos/`, arquivos 23, 03 e 28). Não são do Fogo & Fumaça.
 *   Entraram por decisão do Gabriel em 19/11: "são fotos muito boas. E elas estão
 *   disponíveis pra gente usar". Foto do lugar: quadro do vídeo gravado no Swift (17/11).
 *
 * PARA TROCAR OU ACRESCENTAR (fácil): foto de banda = trocar o arquivo
 * `banda-*.webp` (960 x 600) e o `rosto-*.webp` (112 x 112); banda nova = uma linha em
 * `PALCO.shows`; horário de show = campo `horario` do show (hoje vazio: a organização
 * ainda não divulgou); patrocinador novo = o arquivo `pat-*.webp` e uma linha em
 * `PATROCINADORES`.
 */

import comida1p from '@/assets/fogo-e-fumaca/comida-1-480.webp';
import comida1g from '@/assets/fogo-e-fumaca/comida-1-760.webp';
import comida2p from '@/assets/fogo-e-fumaca/comida-2-480.webp';
import comida2g from '@/assets/fogo-e-fumaca/comida-2-760.webp';
import comida3p from '@/assets/fogo-e-fumaca/comida-3-480.webp';
import comida3g from '@/assets/fogo-e-fumaca/comida-3-760.webp';
import lugar480 from '@/assets/fogo-e-fumaca/lugar-480.webp';
import lugar760 from '@/assets/fogo-e-fumaca/lugar-760.webp';
import logoFogo from '@/assets/fogo-e-fumaca/logo-fogo.webp';
import bandaValter from '@/assets/fogo-e-fumaca/banda-valter.webp';
import bandaCuba from '@/assets/fogo-e-fumaca/banda-cuba.webp';
import bandaRedFox from '@/assets/fogo-e-fumaca/banda-redfox.webp';
import bandaHorses from '@/assets/fogo-e-fumaca/banda-horses.webp';
import rostoValter from '@/assets/fogo-e-fumaca/rosto-valter.webp';
import rostoCuba from '@/assets/fogo-e-fumaca/rosto-cuba.webp';
import rostoRedFox from '@/assets/fogo-e-fumaca/rosto-redfox.webp';
import rostoHorses from '@/assets/fogo-e-fumaca/rosto-horses.webp';
import patAldinox from '@/assets/fogo-e-fumaca/pat-aldinox.webp';
import patBrahma from '@/assets/fogo-e-fumaca/pat-brahma.webp';
import patCampari from '@/assets/fogo-e-fumaca/pat-campari.webp';
import patCoopera from '@/assets/fogo-e-fumaca/pat-coopera.webp';
import patCoral from '@/assets/fogo-e-fumaca/pat-coral.webp';
import patEssencia from '@/assets/fogo-e-fumaca/pat-essencia.webp';
import patEstrela from '@/assets/fogo-e-fumaca/pat-estrela.webp';
import patFestpag from '@/assets/fogo-e-fumaca/pat-festpag.webp';
import patForja from '@/assets/fogo-e-fumaca/pat-forja.webp';
import patGuarana from '@/assets/fogo-e-fumaca/pat-guarana.webp';
import patIpePark from '@/assets/fogo-e-fumaca/pat-ipepark.webp';
import patItts from '@/assets/fogo-e-fumaca/pat-itts.webp';
import patLabrizza from '@/assets/fogo-e-fumaca/pat-labrizza.webp';
import patMoncoc from '@/assets/fogo-e-fumaca/pat-moncoc.webp';
import patMrChurras from '@/assets/fogo-e-fumaca/pat-mrchurras.webp';
import patPaoDeAlho from '@/assets/fogo-e-fumaca/pat-paodealho.webp';
import patPasserini from '@/assets/fogo-e-fumaca/pat-passerini.webp';
import patPepsi from '@/assets/fogo-e-fumaca/pat-pepsi.webp';
import patRc from '@/assets/fogo-e-fumaca/pat-rc.webp';
import patSmLeds from '@/assets/fogo-e-fumaca/pat-smleds.webp';
import patToquinhos from '@/assets/fogo-e-fumaca/pat-toquinhos.webp';

export interface Foto {
  pequena: string;
  /** Largura da foto pequena, em px (para o navegador escolher). */
  larguraPequena: number;
  grande: string;
  alt: string;
  largura: number;
  altura: number;
}

export interface Prato {
  nome: string;
  /** Explicação curta do prato (ex.: "porco desfiado"). */
  nota?: string;
  /** Quem assa. Vazio quando a organização ainda não disse. */
  assador?: string;
}

export interface Show {
  nome: string;
  detalhe?: string;
  /** Horário do show (ex.: "14h"). Vazio enquanto a organização não divulgar. */
  horario?: string;
  foto: string;
  /** Rosto pequeno, para a faixa do topo da página. */
  rosto: string;
  alt: string;
}

export interface Patrocinador {
  nome: string;
  logo: string;
  largura: number;
  altura: number;
}

export const LOGO_DO_FOGO = { src: logoFogo, largura: 800, altura: 405 };

/** A faixa curta que fica no topo da página, antes dos ingressos. */
export const FAIXA = {
  /** No celular são duas linhas fixas; no computador, uma só. */
  linhas: [
    ['12h às 21h', '4 shows'],
    ['Open food', 'Open bar'],
  ],
  botao: 'Ver como vai ser',
};

export const ABERTURA = {
  selo: 'Sábado, 12 de dezembro',
  /** Duas linhas no celular, uma só no computador. */
  titulo: ['Como vai ser', 'o seu dia'],
  texto: '9 horas com 4 shows, open food e open bar.',
};

export const LUGAR = {
  nome: 'Complexo Swift',
  // "Figueiras" é como a organização chama a área do Swift onde o festival acontece
  // (flyer "SHOWS": "Complexo Swift Figueiras"). A confirmar com a Patrícia: o flyer
  // da gráfica fala em "Entrada pelas Figueiras" e em "Entrada pelo Teatro Paulo Moura".
  texto: 'Na área das Figueiras do Complexo Swift.',
  endereco: 'Av. Duque de Caxias, 3900, Jardim dos Seixas, São José do Rio Preto (SP)',
  botao: 'Abrir no mapa',
  mapaUrl:
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent('Complexo Swift, Av. Duque de Caxias, 3900, São José do Rio Preto, SP'),
  foto: {
    pequena: lugar480,
    larguraPequena: 480,
    grande: lugar760,
    alt: 'As figueiras do Complexo Swift, onde acontece o festival',
    largura: 760,
    altura: 570,
  } as Foto,
};

export const CHEGADA = {
  hora: '12h',
  chamada: 'Chegada',
  titulo: 'O fogo acende',
  texto: 'O festival começa ao meio-dia e vai até as 21h, no Complexo Swift, em Rio Preto.',
  /** A régua do dia: começo, fim e quantas horas dá. */
  regua: { de: '12h', ate: '21h', horas: 9, legenda: '9 horas de festival' },
  /** Classificação etária (estava no "Sobre o evento", que esta parte substitui). */
  regras: [
    'Evento só para maiores de 18 anos.',
    'Menores não entram, mesmo acompanhados dos pais ou responsáveis.',
    'Não haverá Área Kids nesta edição.',
  ],
};

/** O que rola entre a abertura e o encerramento (sem hora marcada). */
export const DURANTE = 'Durante o festival, das 12h às 21h';

export const OPEN_FOOD = {
  chamada: 'Comida liberada',
  titulo: 'Open food',
  texto: 'Mais de 10 estações de churrasco, cada uma com o seu assador. Open food completo nos dois setores.',
  tituloDaLista: 'Nas estações',
  /*
   * Prato com assador leva o nome que o Instagram do festival deu ao apresentar o
   * assador (é a fonte que liga a pessoa ao prato). Prato sem assador leva o nome do
   * flyer da organização. Onde os dois nomes diferem, o do flyer está no comentário,
   * e a lista para a Patrícia confirmar está na Doca 417 (versão 3).
   */
  pratos: [
    { nome: 'Costela fogo de chão', assador: 'Leandro Poiate' },
    { nome: 'Brisket', nota: 'peito bovino defumado', assador: 'Rafa Soares' },
    { nome: 'Porco à paraguaia', assador: 'JP Riente' },
    { nome: 'Pulled pork', nota: 'porco desfiado', assador: 'Stefan Guarnieri' },
    { nome: 'Cupim casqueirado', assador: 'Netão, Santa Fé' }, // flyer: "Cupim defumado"
    { nome: 'Pirarucu e salmão na prancha', assador: 'Pachá' }, // flyer: "Peixe na brasa: pirarucu e salmão"
    { nome: 'Paella caipira', assador: 'Vitório Silva' },
    { nome: 'Pão de alho', assador: 'Quaresma BBQ e Rodolfo' }, // não está no flyer
    { nome: 'Legumes defumados', nota: 'opção vegana', assador: 'Adriano Rocha' },
    { nome: 'Arroz doce com caramelo salgado', assador: 'Marlon e Thiago Teles' },
    { nome: 'Ancho', assador: 'Carol Armenio' },
    { nome: 'Chorizo', assador: 'Rogerinho' },
    { nome: 'Tulipa de frango defumada', assador: 'Marcelo Paranhos' },
  ] as Prato[],
  // Instagram: "burger defumado (só VIP)"; flyer: "Hambúrguer defumado exclusivo do VIP".
  soNoVip: { nome: 'Hambúrguer defumado', assador: 'Carlos Palauro' } as Prato,
  /** O quadro de três fotos, uma em cima da outra (pedido do Gabriel, 19/11). */
  fotos: [
    {
      pequena: comida1p,
      larguraPequena: 480,
      grande: comida1g,
      alt: 'Costelas penduradas assando no fogo de chão',
      largura: 760,
      altura: 456,
    },
    {
      pequena: comida2p,
      larguraPequena: 480,
      grande: comida2g,
      alt: 'Peça de carne defumada aberta ao meio, nas mãos de quem assa',
      largura: 760,
      altura: 456,
    },
    {
      pequena: comida3p,
      larguraPequena: 480,
      grande: comida3g,
      alt: 'Bife na grelha, com a chama subindo',
      largura: 760,
      altura: 456,
    },
  ] as Foto[],
};

export const OPEN_BAR = {
  chamada: 'Bebida liberada',
  titulo: 'Open bar',
  texto: 'Chope, drinks e refrigerante liberados do começo ao fim, nos dois setores.',
  grupos: [
    {
      nome: 'Premium e VIP',
      itens: [
        'Chope Brahma',
        'Campari',
        'Caipirinha',
        'Pepsi e Pepsi Zero',
        'Guaraná Antarctica e Zero',
        'Água mineral',
      ],
    },
    {
      nome: 'Só no VIP',
      itens: ['Aperol Spritz', 'Patagônia', 'Spaten', 'Energético ITTS'],
    },
  ],
  aviso: 'Proibido para menores de 18 anos. Beba com moderação.',
};

export const PALCO = {
  chamada: 'Música ao vivo',
  titulo: '4 shows',
  texto: 'Quatro atrações no palco, passando pelo country, pelo sertanejo e pelo rock.',
  shows: [
    {
      nome: 'Valter Jr e Vinícius',
      foto: bandaValter,
      rosto: rostoValter,
      alt: 'A dupla Valter Jr e Vinícius cantando',
    },
    {
      nome: 'Rafael Cuba',
      detalhe: 'e banda',
      foto: bandaCuba,
      // O rosto pequeno é o do Rafael: na arte oficial ele está na frente, no centro,
      // com o nome em cima. A foto grande mostra os três.
      rosto: rostoCuba,
      alt: 'Rafael Cuba e banda',
    },
    {
      nome: 'Red Fox',
      detalhe: 'Country music',
      foto: bandaRedFox,
      rosto: rostoRedFox,
      alt: 'Os cinco integrantes da banda Red Fox',
    },
    {
      nome: 'The Horses',
      foto: bandaHorses,
      rosto: rostoHorses,
      alt: 'Os quatro integrantes da banda The Horses',
    },
  ] as Show[],
  /** Todas as fotos de banda têm este tamanho. */
  fotoLargura: 960,
  fotoAltura: 600,
};

export const SETORES = {
  chamada: 'Onde você fica',
  titulo: 'Premium ou VIP',
  texto: 'Os dois setores têm open food e open bar. O VIP fica em frente ao palco e tem mais serviço.',
  setores: [
    {
      nome: 'Premium',
      destaque: false,
      itens: [
        'Open food completo',
        'Open bar completo',
        'Livre circulação e autoatendimento',
        'Acesso a todos os shows',
      ],
    },
    {
      nome: 'VIP',
      destaque: true,
      itens: [
        'Tudo do Premium',
        'Área reservada em frente ao palco',
        'Mesas e cadeiras',
        'Serviço de garçons, conforme a operação planejada',
        'Mais cortes especiais, hambúrguer defumado e gelato artesanal',
        'Aperol Spritz, Patagônia, Spaten e energético ITTS',
      ],
    },
  ],
  botao: 'Ver ingressos',
};

export const FECHO = {
  hora: '21h',
  chamada: 'Encerramento',
  titulo: 'A última brasa',
  texto: 'O festival vai até as 21h. São 9 horas de fogo, chope e show.',
  /** Só aparece enquanto há ingresso à venda. */
  textoComVenda: 'Só falta o seu ingresso.',
  botao: 'Garantir meu ingresso',
  resumo: ['Sábado, 12 de dezembro', 'Das 12h às 21h', 'Complexo Swift, Rio Preto', 'Só maiores de 18 anos'],
};

/** A barrinha fixa do celular, enquanto a pessoa está nesta parte da página. */
export const BARRA = { texto: 'Fogo & Fumaça · 12/12', botao: 'Ver ingressos' };

export const PATROCINIO = {
  titulo: 'Patrocinadores e parceiros',
  texto: 'Juntos, eles fazem este festival acontecer.',
};

/**
 * Na ordem das artes da Thaís (18/11), lidas da esquerda para a direita e de cima para
 * baixo: destaques (com o Ipê Park, que ganhou uma arte só dele, fechando a fileira),
 * comidas e bebidas, diversas e apoios.
 */
export const PATROCINADORES: Patrocinador[][] = [
  [
    { nome: 'Chopp Brahma', logo: patBrahma, largura: 313, altura: 170 },
    { nome: 'Coral Pescados', logo: patCoral, largura: 219, altura: 170 },
    { nome: 'Estrela Alimentos', logo: patEstrela, largura: 196, altura: 170 },
    { nome: 'FestPag', logo: patFestpag, largura: 320, altura: 97 },
    { nome: 'Ipê Park Convention Hotel', logo: patIpePark, largura: 172, altura: 170 },
  ],
  [
    { nome: 'Passerini Gelato', logo: patPasserini, largura: 171, altura: 170 },
    { nome: 'ITTS', logo: patItts, largura: 253, altura: 170 },
    { nome: 'Pão de Alho do Patrão', logo: patPaoDeAlho, largura: 141, altura: 170 },
    { nome: 'Guaraná Antarctica', logo: patGuarana, largura: 168, altura: 170 },
    { nome: 'Campari', logo: patCampari, largura: 320, altura: 69 },
    { nome: 'Pepsi', logo: patPepsi, largura: 170, altura: 170 },
  ],
  [
    { nome: 'Moncoc', logo: patMoncoc, largura: 320, altura: 154 },
    { nome: 'SM Leds', logo: patSmLeds, largura: 320, altura: 70 },
    { nome: 'Aldinox', logo: patAldinox, largura: 256, altura: 170 },
    { nome: 'Mr. Churras', logo: patMrChurras, largura: 194, altura: 170 },
    { nome: 'Toquinhos de Curral', logo: patToquinhos, largura: 201, altura: 170 },
  ],
  [
    { nome: 'Essencia Concept', logo: patEssencia, largura: 320, altura: 94 },
    { nome: "La'Brizza Cosmetics", logo: patLabrizza, largura: 320, altura: 84 },
    { nome: 'RC Produções', logo: patRc, largura: 211, altura: 170 },
    { nome: 'Coopera', logo: patCoopera, largura: 155, altura: 170 },
    { nome: 'Forja de Platina', logo: patForja, largura: 172, altura: 170 },
  ],
];
