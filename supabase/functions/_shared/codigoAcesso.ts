/*
 * O motor do código de acesso: gera, guarda (só o hash), entrega pelo canal e
 * confere. Serve ao cadastro, ao login (senha + código), à confirmação de um
 * canal novo e à recuperação de senha. Plano de 09/09/2026 — `_docs/plano-login-cpf-whatsapp.md`.
 *
 * Regras que não se negociam:
 *   · O código nunca é gravado nem logado — só `sha256(id:código)`.
 *   · Vale 10 minutos. Cinco erros queimam o desafio (é preciso pedir outro).
 *   · Pedir código tem limite por destino (3 em 15 min) e por IP (10 em 15 min),
 *     fail-closed pelo `check_rate_limit` que o checkout já usa.
 *   · Um pedido novo para o mesmo destino/propósito apaga os anteriores em aberto.
 *   · Quem chama é sempre uma edge com service role (`auth_codigos` não tem
 *     política: pela API pública ninguém lê nem escreve).
 */
import { checkRateLimit, type RateLimitResult } from './rateLimit.ts';
import { enviarTextoWhatsApp, mascararNumero } from './whatsapp.ts';
import { assuntoCodigo, htmlCodigo } from './emailCodigo.ts';
import { generateOtpCode } from './otp.ts';
import { maskEmail } from './pii.ts';

export const VALIDADE_MIN = 10;
export const MAX_TENTATIVAS = 5;

export type Proposito = 'cadastro' | 'login' | 'canal' | 'reset';
export type Canal = 'whatsapp' | 'email';

export type PedidoDeCodigo = {
  proposito: Proposito;
  canal: Canal;
  /** "55DDDNÚMERO" ou e-mail em minúsculas — já normalizado por quem chama. */
  destino: string;
  cpf?: string | null;
  userId?: string | null;
  nome?: string | null;
  ip: string;
};

export type ResultadoEnvio =
  | { ok: true; desafioId: string; expiraEm: string }
  | { ok: false; erro: 'rate_limited' | 'rate_limit_unavailable'; rateLimit: RateLimitResult }
  | { ok: false; erro: 'whatsapp_indisponivel' | 'whatsapp_recusou' | 'whatsapp_nao_configurado' | 'email_nao_enviado' | 'resend_nao_configurado' | 'falha_ao_guardar' };

export type Desafio = {
  id: string;
  proposito: Proposito;
  canal: Canal;
  destino: string;
  cpf: string | null;
  user_id: string | null;
};

export type ResultadoConferencia =
  | { ok: true; desafio: Desafio }
  | { ok: false; erro: 'nao_encontrado' | 'expirado' | 'queimado' | 'codigo_invalido'; tentativasRestantes?: number };

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function textoWhatsApp(codigo: string): string {
  return [
    `*${codigo}* é o seu código de acesso à FestPag.`,
    '',
    `Digite esse número no site para continuar. Ele vale por ${VALIDADE_MIN} minutos.`,
    '',
    'Ninguém da FestPag vai pedir esse código para você. Se não foi você que pediu, é só ignorar.',
  ].join('\n');
}

async function entregar(canal: Canal, destino: string, codigo: string, nome: string | null | undefined): Promise<ResultadoEnvio | null> {
  if (canal === 'whatsapp') {
    const r = await enviarTextoWhatsApp(destino, textoWhatsApp(codigo), { timeoutMs: 8_000 });
    if (r.ok) return null;
    return { ok: false, erro: r.erro as 'whatsapp_indisponivel' | 'whatsapp_recusou' | 'whatsapp_nao_configurado' };
  }
  const chave = Deno.env.get('RESEND_API_KEY');
  if (!chave) return { ok: false, erro: 'resend_nao_configurado' };
  const Resend = (await import('https://esm.sh/resend@2.0.0')).Resend;
  const resend = new Resend(chave);
  const { error } = await resend.emails.send({
    from: 'FestPag <naoresponda@festpag.com.br>',
    to: [destino],
    subject: assuntoCodigo(codigo),
    html: htmlCodigo({ codigo, nome, validadeMin: VALIDADE_MIN }),
  });
  if (error) {
    console.error('[CODIGO] Resend recusou para', maskEmail(destino), error);
    return { ok: false, erro: 'email_nao_enviado' };
  }
  return null;
}

/** Gera, guarda e entrega. Devolve o id do desafio, que a tela devolve junto do código. */
export async function criarEEnviarCodigo(admin: any, pedido: PedidoDeCodigo): Promise<ResultadoEnvio> {
  const destino = pedido.canal === 'email' ? pedido.destino.trim().toLowerCase() : pedido.destino;

  const rlDestino = await checkRateLimit(admin, `codigo:${pedido.canal}:${destino}`, 3, 900, 1800);
  if (!rlDestino.allowed) return { ok: false, erro: rlDestino.unavailable ? 'rate_limit_unavailable' : 'rate_limited', rateLimit: rlDestino };
  const rlIp = await checkRateLimit(admin, `codigo:ip:${pedido.ip}`, 10, 900, 1800);
  if (!rlIp.allowed) return { ok: false, erro: rlIp.unavailable ? 'rate_limit_unavailable' : 'rate_limited', rateLimit: rlIp };

  // Um pedido novo invalida os anteriores em aberto para o mesmo destino/propósito.
  await admin.from('auth_codigos')
    .update({ usado_em: new Date().toISOString() })
    .eq('destino', destino).eq('proposito', pedido.proposito).is('usado_em', null);

  const id = crypto.randomUUID();
  const codigo = generateOtpCode();
  const expiraEm = new Date(Date.now() + VALIDADE_MIN * 60 * 1000).toISOString();

  const { error } = await admin.from('auth_codigos').insert({
    id,
    proposito: pedido.proposito,
    canal: pedido.canal,
    destino,
    cpf: pedido.cpf ?? null,
    user_id: pedido.userId ?? null,
    codigo_hash: await sha256Hex(`${id}:${codigo}`),
    expira_em: expiraEm,
    ip: pedido.ip,
  });
  if (error) {
    console.error('[CODIGO] não guardou', error.message);
    return { ok: false, erro: 'falha_ao_guardar' };
  }

  const falha = await entregar(pedido.canal, destino, codigo, pedido.nome);
  if (falha) {
    // Não entregou: queima o desafio para o código não ficar vivo à toa.
    await admin.from('auth_codigos').update({ usado_em: new Date().toISOString() }).eq('id', id);
    return falha;
  }

  console.log('[CODIGO]', pedido.proposito, 'entregue por', pedido.canal, 'para',
    pedido.canal === 'whatsapp' ? mascararNumero(destino) : maskEmail(destino));
  return { ok: true, desafioId: id, expiraEm };
}

/** Confere o código de um desafio. Sucesso marca `usado_em`; cinco erros queimam. */
export async function conferirCodigo(admin: any, desafioId: string, codigo: string): Promise<ResultadoConferencia> {
  const digitos = String(codigo ?? '').replace(/\D/g, '');
  const { data: row, error } = await admin.from('auth_codigos')
    .select('id, proposito, canal, destino, cpf, user_id, codigo_hash, tentativas, expira_em, usado_em')
    .eq('id', desafioId).maybeSingle();
  if (error || !row) return { ok: false, erro: 'nao_encontrado' };
  if (row.usado_em) return { ok: false, erro: 'queimado' };
  if (new Date(row.expira_em).getTime() < Date.now()) return { ok: false, erro: 'expirado' };

  const bate = digitos.length === 6 && (await sha256Hex(`${row.id}:${digitos}`)) === row.codigo_hash;
  if (!bate) {
    const tentativas = (row.tentativas ?? 0) + 1;
    const queimar = tentativas >= MAX_TENTATIVAS;
    await admin.from('auth_codigos')
      .update({ tentativas, ...(queimar ? { usado_em: new Date().toISOString() } : {}) })
      .eq('id', row.id);
    return queimar
      ? { ok: false, erro: 'queimado' }
      : { ok: false, erro: 'codigo_invalido', tentativasRestantes: MAX_TENTATIVAS - tentativas };
  }

  // Sucesso: marca usado, só se ainda estava aberto (duas abas conferindo ao mesmo tempo → uma ganha).
  const { data: fechado } = await admin.from('auth_codigos')
    .update({ usado_em: new Date().toISOString() })
    .eq('id', row.id).is('usado_em', null)
    .select('id').maybeSingle();
  if (!fechado) return { ok: false, erro: 'queimado' };

  return {
    ok: true,
    desafio: { id: row.id, proposito: row.proposito, canal: row.canal, destino: row.destino, cpf: row.cpf ?? null, user_id: row.user_id ?? null },
  };
}

// O e-mail interno de quem só tem WhatsApp mora em ./emailInterno.ts (arquivo
// pequeno, para as edges de pagamento importarem sem carregar o motor).
export { emailInternoSemEmail, ehEmailInterno } from './emailInterno.ts';
