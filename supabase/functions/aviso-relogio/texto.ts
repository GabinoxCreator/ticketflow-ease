/*
 * O texto do alarme do relógio do PIX, separado da edge de propósito (mesmo
 * padrão do `aviso-repasse/texto.ts`): é a parte que uma pessoa lê. Função
 * pura, dá para rodar num script e LER a mensagem como ela chega, sem subir
 * nada e sem mandar mensagem para ninguém.
 *
 * Quem lê é o Gabriel (decisão dele, 06/10: só ele, por WhatsApp e push).
 * Regra de material da casa: sem travessão.
 */

export type TipoAlarme = 'caiu' | 'ainda' | 'voltou';

export interface Alarme {
  id: string;
  tipo: TipoAlarme;
  created_at: string;
  // retrato de `relogio_do_pix_saude` + datas do incidente (ver a migration)
  dados: {
    ultima_boa_em?: string | null;
    motivo?: string | null;
    incidente_aberto_em?: string | null;
    incidente_desde?: string | null;
    [k: string]: unknown;
  };
}

/** O pg_net guarda as respostas só por 6 horas: sem resposta boa nelas, é "mais de 6 h". */
const GUARDA_HORAS = 6;

const PEDIDO_DO_CHAT = 'investigar o relógio do PIX (OS-158)';

const MOTIVO: Record<string, string> = {
  sem_resposta: 'o relógio chama a conferência, mas ela não responde a tempo',
  marcel_sem_resposta: 'a conferência roda, mas o Marcel não responde nenhuma consulta',
  relogio_nao_roda: 'o relógio não roda há mais de 5 minutos',
  relogio_com_erro: 'o relógio está dando erro ao rodar',
  relogio_desligado: 'o relógio está desligado no banco',
  relogio_apagado: 'o relógio não existe mais no banco',
};

export function motivoEmPalavras(m: string | null | undefined): string {
  return MOTIVO[String(m ?? '')] ?? 'não deu para saber pelo banco';
}

function data(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** "06/10 22:40", no fuso de Brasília: quem lê vive nele, não em UTC. */
export function quandoBR(iso: string | null | undefined): string {
  const d = data(iso);
  if (!d) return '?';
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} ${hora}`;
}

/** 17 → "17 min" · 197 → "3h17" · 1500 → "25h00". */
export function duracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

function minutosEntre(de: string | null | undefined, ate: string | null | undefined): number | null {
  const a = data(de);
  const b = data(ate);
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 60_000;
}

/** Há quanto tempo, na hora em que o alarme nasceu (não na hora do reenvio). */
function haQuantoTempo(a: Alarme): string {
  const desde = a.tipo === 'caiu' ? a.dados.ultima_boa_em : a.dados.incidente_desde;
  const min = minutosEntre(desde, a.created_at);
  if (min !== null) return duracao(min);
  // Sem resposta boa nas 6 horas guardadas: contar a partir de quando o vigia notou.
  const desdeAbertura = minutosEntre(a.dados.incidente_aberto_em, a.created_at);
  const base = GUARDA_HORAS * 60 + (desdeAbertura ?? 0);
  return `mais de ${duracao(base)}`;
}

/** A mensagem do WhatsApp. Entendida na notificação, sem abrir nada. */
export function montarWhatsApp(a: Alarme): string {
  const l: string[] = [];
  if (a.tipo === 'caiu') {
    l.push('🚨 *RELÓGIO DO PIX PAROU* (site de ingressos)');
    l.push('');
    l.push(`Há ${haQuantoTempo(a)} o relógio que pergunta ao Marcel se o PIX foi pago não traz resposta boa.`);
    l.push(`Provável: ${motivoEmPalavras(a.dados.motivo)}.`);
    l.push('');
    l.push('Enquanto ele não volta, PIX pago por quem fechou a página pode ficar sem confirmar e sem ingresso.');
    l.push('');
    l.push(`👉 Abra um chat e peça: "${PEDIDO_DO_CHAT}".`);
    if (a.dados.ultima_boa_em) l.push(`Última resposta boa: ${quandoBR(a.dados.ultima_boa_em)}.`);
  } else if (a.tipo === 'ainda') {
    l.push('⏰ *RELÓGIO DO PIX CONTINUA PARADO* (site de ingressos)');
    l.push('');
    l.push(`Sem resposta boa há ${haQuantoTempo(a)}.`);
    l.push(`Provável: ${motivoEmPalavras(a.dados.motivo)}.`);
    l.push('');
    l.push(`👉 Abra um chat e peça: "${PEDIDO_DO_CHAT}".`);
  } else {
    l.push('✅ *RELÓGIO DO PIX VOLTOU* (site de ingressos)');
    l.push('');
    // Sem a última resposta boa (passou das 6 horas guardadas), só dá para dizer quando voltou.
    const periodo = a.dados.incidente_desde
      ? `de ${quandoBR(a.dados.incidente_desde)} a ${quandoBR(a.created_at)}`
      : `voltou em ${quandoBR(a.created_at)}`;
    l.push(`Ficou ${haQuantoTempo(a)} sem resposta boa (${periodo}).`);
    l.push('Ele mesmo confere de novo os PIX das últimas 48 horas. Se achar PIX pago em pedido que venceu nesse meio tempo, o pedido fica marcado para análise.');
  }
  return l.join('\n');
}

/** O push e o sino da gestão: título curto, corpo de uma ou duas frases. */
export function montarPush(a: Alarme): { titulo: string; mensagem: string } {
  if (a.tipo === 'caiu') {
    return {
      titulo: `Relógio do PIX parou há ${haQuantoTempo(a)}`,
      mensagem: `Provável: ${motivoEmPalavras(a.dados.motivo)}. PIX pago por quem fechou a página pode ficar sem confirmar. Abra um chat e peça: ${PEDIDO_DO_CHAT}.`,
    };
  }
  if (a.tipo === 'ainda') {
    return {
      titulo: `Relógio do PIX continua parado (${haQuantoTempo(a)})`,
      mensagem: `Provável: ${motivoEmPalavras(a.dados.motivo)}. Abra um chat e peça: ${PEDIDO_DO_CHAT}.`,
    };
  }
  return {
    titulo: `Relógio do PIX voltou (ficou ${haQuantoTempo(a)} parado)`,
    mensagem: 'Ele mesmo confere de novo os PIX das últimas 48 horas.',
  };
}
