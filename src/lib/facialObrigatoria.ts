/*
 * A CHAVE da facial obrigatória no cadastro do comprador (OS-343).
 *
 * ⚠️ NASCE DESLIGADA, e só quem liga é o maestro.
 *
 * CAMINHO D (03/11/2026): o Gabriel, pela direção, escolheu "Obrigatória, assumindo
 * o risco", ciente do parecer de 02/10 (que recomenda o caminho B e classifica a
 * obrigatória para toda conta nova como risco jurídico alto). Registro formal em
 * `Cofre-Negocios/FestPag/Decisões.md` (03/11). O parecer põe 5 condições mínimas
 * para o caminho D, e elas são a lista abaixo, junto com o que o código precisa
 * para não mentir na Política. Não se espera mais o advogado (28/10 a 03/11 era
 * "esperar o advogado"; ficou para trás).
 *
 * A TRAVA (revisão 2, 30/10/2026): o corte só vale com TODAS as condições de
 * `CONDICOES_PARA_LIGAR` verdadeiras. Gravar a data sozinha não liga nada. Cada
 * condição só vira `true` no mesmo commit que traz a prova dela (Doca 346, fase 2
 * do caminho D), e o maestro confere a lista antes de publicar.
 *
 * COMO LIGAR (maestro): virar as condições para `true`, uma por uma, com a prova, e
 * trocar `null` em `FACIAL_OBRIGATORIA_DESDE` pelo instante do corte, com fuso,
 * por exemplo '2026-11-10T09:00:00-03:00', no mesmo commit que publica.
 *  · Conta criada DEPOIS do corte faz a facial no próprio cadastro.
 *  · Conta criada ANTES do corte faz a facial na PRÓXIMA COMPRA, antes de pagar
 *    (decisão do Gabriel, 03/11/2026). Nunca no login, nunca no aceite de ingresso
 *    transferido, e o ingresso que ela já tem continua valendo (entra pelo QR).
 * A versão da Política de Privacidade passa a ser o dia do corte, sozinha.
 *
 * COMO DESLIGAR: voltar `FACIAL_OBRIGATORIA_DESDE` para `null` e publicar. Nada no
 * banco muda; quem já cadastrou o rosto continua com ele.
 *
 * Para PROVAR com a chave ligada sem tocar no site do ar: no computador de quem
 * constrói, `VITE_FACIAL_OBRIGATORIA_DESDE=<instante> bunx vite`. A variável só
 * vale em modo de desenvolvimento (`import.meta.env.DEV`) e pula a trava, para dar
 * para ver o desenho; no site publicado ela é ignorada e a trava vale inteira.
 */
export const CONDICOES_PARA_LIGAR = {
  /** Condição 5 do parecer: a decisão da direção registrada por escrito. Feito em
   *  `FestPag/Decisões.md` (03/11); falta o termo de 1 página ASSINADO pelo Gabriel e
   *  arquivado (`~/Downloads/FestPag-Juridico/FestPag-Termo-Decisao-Facial-Obrigatoria-*.pdf`). */
  decisaoDaDirecaoAssinada: false,
  /** Condição 1: o Relatório de Impacto do caminho D, com os dados de fraude contados
   *  no banco, pronto e arquivado (a ANPD pede quando quiser; não se protocola). */
  ripdComDadosDeFraude: false,
  /** Condição 3: a revisão humana na portaria e no totem (art. 20) definida e entregue
   *  à equipe: quem atende, o que faz quando a facial recusa ou falha, como registra. */
  revisaoHumanaNaPortaria: false,
  /** A Política de Privacidade do caminho D (o texto ligado de `PoliticaPrivacidade.tsx`)
   *  aprovada pelo Gabriel, palavra por palavra. APROVADA em 03/11/2026 na caixinha
   *  ("Aprovar como está"), com o texto da Doca 346. Mexeu no texto ligado: volta a
   *  `false` até ele aprovar de novo. */
  politicaCaminhoDAprovada: true,
  /** A foto obrigatória não vira autorização de pagar com o rosto: o `facial-enroll`
   *  marca a finalidade "entrada" e a `festcash-push-facial` recusa essa foto. Código
   *  neste galho; vira `true` com o redeploy das duas e a conferência no ar, E com o
   *  Marcel confirmando que a base de rostos dele (o `facecadastro`, que recebe toda foto
   *  do site) não é usada em nenhum pagamento (FacePag, totem). Se for, a promessa "a
   *  foto da entrada não paga" depende de ele separar as duas (pergunta guardada no
   *  rascunho B, Doca 346). */
  fotoSeparadaDoPagamento: false,
  /** O QR na tela provado no ar (redeploy da `facial-link`, a rota `/facial` no domínio). */
  qrConferidoNoAr: false,
  /** A idade conferida na base de CPF (Marcel, que consulta a Receita pela Consulta CPF v3:
   *  CPF + data de nascimento). Em 03/11 a base ainda respondia 410 "versão descontinuada"
   *  a toda consulta de CPF: sem ela, ninguém faz a foto (a idade não é só declarada:
   *  ECA Digital). Vira `true` com a consulta de verdade respondendo no ar. */
  idadeConferidaNaBase: false,
  /** A Política promete três coisas sobre o prazo (decisão de 15/10), e as três têm de
   *  existir no ar antes de a promessa valer: apagar a foto depois de 12 meses sem uso
   *  (sem compra e sem entrada pela facial); avisar por e-mail 60 dias antes; e, nesse
   *  caso, na exclusão da conta e na exclusão do cadastro facial, pedir ao fornecedor
   *  (Marcel) que apague a cópia dele.
   *  TAREFA de quem construir o expurgo e a exclusão só do cadastro facial (a conta
   *  continua): além da foto e de `facial_photo_path`, limpar `profiles.facial_consent_at`
   *  (senão o carimbo fica, como se a pessoa ainda tivesse facial autorizada, e a
   *  portaria e a ponte da carteira leem esse carimbo) e as marcas `facial_finalidade` e
   *  `facial_pagamento_autorizado_em` do `app_metadata`. */
  retencaoDe12MesesNoAr: false,
  /** O link de cortesia (OS-313, na main desde 30/10) não pede o rosto duas vezes. Pelo
   *  código não pede (usa o `FluxoConta` embutido com `semFacial`); vira `true` com a
   *  conferência na tela, com a chave ligada. */
  cortesiaOS313SemRostoDuplo: false,
  /** O link de cortesia (`CortesiaLink.tsx`) e o aceite de ingresso transferido com
   *  facial (`TransferenciaIngresso.tsx`, OS-357) ainda usam o convite com a caixa
   *  única "check-in e pagamentos" (`FacialInviteModal`): mandam `entrada_e_pagamento`,
   *  sem pergunta de idade e sem a marca de idade do servidor. Com a facial obrigatória
   *  para ter o ingresso, um menor cadastra o rosto e a autorização de pagar sai junto,
   *  como condição do ingresso: contra a Política ligada e a decisão de 03/11. Vira
   *  `true` quando os dois caminhos pedirem a idade (conferida no servidor) antes da
   *  foto e a autorização de pagar for separada e opcional. Texto de cliente: do
   *  Gabriel (linha na Entrada de 03/11). */
  cortesiaETransferenciaNoCaminhoD: false,
} as const;

export const FACIAL_OBRIGATORIA_DESDE: string | null = null;

function lerCorte(): Date | null {
  const local = import.meta.env.DEV ? (import.meta.env.VITE_FACIAL_OBRIGATORIA_DESDE as string | undefined) : undefined;
  const valor = local || FACIAL_OBRIGATORIA_DESDE;
  if (!valor) return null;
  // No site publicado, a data sozinha não liga: todas as condições têm de estar de pé.
  if (!local && !Object.values(CONDICOES_PARA_LIGAR).every(Boolean)) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** O instante do corte, ou null com a chave desligada. */
export const CORTE_DA_FACIAL: Date | null = lerCorte();

/** A chave está ligada? */
export function facialObrigatoria(): boolean {
  return CORTE_DA_FACIAL !== null;
}

/** 'aaaa-mm-dd' no fuso de Brasília. É o formato da versão dos documentos legais. */
export function diaEmBrasilia(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/** O dia do corte ('aaaa-mm-dd'), ou null com a chave desligada. */
export function diaDoCorte(): string | null {
  return CORTE_DA_FACIAL ? diaEmBrasilia(CORTE_DA_FACIAL) : null;
}

/**
 * Conta nova = criada depois do corte. Ela faz a facial no próprio cadastro.
 * A conta antiga faz na próxima compra (`precisaDaFacial`, decisão de 03/11).
 * Sem data de criação (não deveria acontecer), a conta é tratada como antiga.
 */
export function contaNovaParaFacial(criadaEm?: string | null): boolean {
  if (!CORTE_DA_FACIAL || !criadaEm) return false;
  const t = new Date(criadaEm).getTime();
  return !Number.isNaN(t) && t >= CORTE_DA_FACIAL.getTime();
}

/* ── Idade ─────────────────────────────────────────────────────────────────
 * Menor de 18 anos não faz facial (decisão de 28/10/2026, seguindo o parecer de
 * 02/10: "bloquear o cadastro facial para menores de 18 anos", art. 14 da LGPD e
 * ECA Digital). A data de nascimento só é pedida com a chave ligada.
 */

/** dd/mm/aaaa → 'aaaa-mm-dd', ou null se a data não existe ou é impossível. */
export function nascimentoDigitado(texto: string): string | null {
  const m = texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  const hoje = diaEmBrasilia(new Date());
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (iso > hoje || ano < 1900) return null;
  return iso;
}

/** Idade completa hoje, no fuso de Brasília, a partir de 'aaaa-mm-dd'. */
export function idadeEm(nascimento: string, hoje: string = diaEmBrasilia(new Date())): number {
  const [a, m, d] = nascimento.split('-').map(Number);
  const [ha, hm, hd] = hoje.split('-').map(Number);
  let idade = ha - a;
  if (hm < m || (hm === m && hd < d)) idade -= 1;
  return idade;
}

/* ── O que fica guardado na conta ──────────────────────────────────────────
 * Nos metadados do usuário (auth), sem coluna nova e sem migration. São dados que
 * a própria pessoa declara e pode alterar; servem só para a TELA decidir o caminho.
 * A trava de idade que vale é a do SERVIDOR (caminho D, 03/11): a `document-lookup`
 * só marca a conta como "maior de 18 conferido na base" (`app_metadata`, que o
 * navegador não escreve) quando a base de CPF confirma a data e o CPF é o da conta,
 * e o `facial-enroll` recusa a foto da entrada sem essa marca. O registro da casa é
 * a linha em `audit_logs` (`registrar_convite_facial`).
 */
export type SaidaDaFacial = 'menor' | 'nao_consegue' | 'idade_nao_conferida';

export interface MetaDaFacial {
  facial_saida?: SaidaDaFacial;
  facial_saida_em?: string;
  nascimento?: string;
  /** 'base' = a base do CPF confirmou · 'nao_confere' = a base disse que não bate ·
   *  'digitada' = a base não respondeu (desde o caminho D, 03/11, sem a base não há foto) */
  nascimento_conferido?: 'base' | 'digitada' | 'nao_confere';
}

/** "Não consigo" vale até a próxima compra; 12 horas cobre a compra que está em curso. */
const VALE_ATE_A_PROXIMA_COMPRA_MS = 12 * 60 * 60 * 1000;

/**
 * Esta conta precisa fazer a facial antes de pagar?
 * Só com a chave ligada, só sem rosto cadastrado. Vale para a conta NOVA (que
 * fugiu do cadastro no meio) e para a conta ANTIGA, criada antes do corte, que faz
 * a facial na próxima compra (decisão do Gabriel, 03/11/2026: a dispensa das contas
 * antigas contradizia a tese da necessidade, condição 4 do parecer). Só na compra:
 * o login e o aceite de ingresso transferido nunca cobram, e o ingresso que a
 * pessoa já tem continua valendo pelo QR.
 *  · menor de 18: não, até completar 18;
 *  · "não consigo" ou idade não conferida: não nas próximas 12 horas (a compra
 *    em curso segue); na próxima compra, o pedido volta, pelo mesmo caminho.
 */
export function precisaDaFacial(
  usuario: { created_at?: string | null; user_metadata?: Record<string, unknown> | null } | null,
  temFacial: boolean,
): boolean {
  if (!facialObrigatoria() || !usuario || temFacial) return false;
  const meta = (usuario.user_metadata ?? {}) as MetaDaFacial;
  if (meta.facial_saida === 'menor' && meta.nascimento && idadeEm(meta.nascimento) < 18) return false;
  if ((meta.facial_saida === 'nao_consegue' || meta.facial_saida === 'idade_nao_conferida') && meta.facial_saida_em) {
    const quando = new Date(meta.facial_saida_em).getTime();
    if (!Number.isNaN(quando) && Date.now() - quando < VALE_ATE_A_PROXIMA_COMPRA_MS) return false;
  }
  return true;
}
