/*
 * O carteiro do WhatsApp do site de ingressos.
 *
 * Cópia enxuta do que a gestão já usa (`arya-send` e `arya-check-number`), sem a
 * parte de sessão de usuário — aqui quem chama é o próprio sistema (login por
 * código, entrega do ingresso), nunca um navegador.
 *
 * Servidor: Evolution API (VPS da FestPag), instância `FestPag-Atendimento`,
 * número da empresa +55 11 5304-6659.
 *
 * De onde vem a configuração (nesta ordem):
 *   1. secrets da edge EVOLUTION_BASE_URL · EVOLUTION_API_KEY · EVOLUTION_INSTANCE;
 *   2. o Vault do banco, segredo `evolution` = {"base_url","api_key","instance"},
 *      lido pela RPC `ler_segredo` (só o service role executa). É o caminho
 *      usado no Lovable Cloud, onde não há painel de secrets à mão.
 *   Chamar `carregarConfigWhatsApp(admin)` uma vez no início da edge.
 *
 * ⚠️ Esse servidor cai (ficou fora do ar em 08–09/09/2026). Toda chamada tem
 * limite de tempo curto, e quem chama precisa ter plano B (a tela oferece o
 * e-mail quando o WhatsApp falha).
 *
 * ── Dois caminhos (OS-174, 08/10/2026) ──────────────────────────────────────
 * Em 07/10 o WhatsApp restringiu o 11 5304-6659 por "spam": a Evolution imita
 * um celular e mandava código e ingresso para quem nunca falou com o número.
 * Por isso o que vai para CLIENTE (código de acesso e ingresso) sai pela API
 * oficial da Meta (WhatsApp Cloud API), num número próprio, com modelos de
 * mensagem aprovados: `enviarCodigoWhatsApp` e `enviarIngressoWhatsApp`.
 * A Evolution continua aqui para os avisos internos (repasse, reembolso,
 * relógio), que vão para números que já conversam com o nosso.
 *
 * Configuração da API oficial (nesta ordem):
 *   1. secrets da edge WHATSAPP_CLOUD_TOKEN · WHATSAPP_CLOUD_PHONE_ID
 *      (opcionais: WHATSAPP_CLOUD_MODELO_CODIGO · WHATSAPP_CLOUD_MODELO_INGRESSO
 *      · WHATSAPP_CLOUD_IDIOMA · WHATSAPP_CLOUD_VERSAO);
 *   2. o Vault, segredo `whatsapp_cloud` = {"token","phone_number_id",
 *      "modelo_codigo","modelo_ingresso","idioma","versao"}.
 *   Sem nenhum dos dois, código e ingresso seguem pela Evolution como antes:
 *   o código pode subir antes de a Meta aprovar o número e os modelos.
 *   Com a API oficial ligada, código e ingresso NUNCA caem para a Evolution
 *   (seria repetir o que causou a restrição): o plano B é o e-mail.
 */

export type ConfigWhatsApp = { baseUrl: string; apiKey: string; instance: string };

export type ConfigOficial = {
  token: string;
  phoneNumberId: string;
  modeloCodigo: string;
  modeloIngresso: string;
  idioma: string;
  versao: string;
};

let configCarregada: ConfigWhatsApp | null = null;
let oficialCarregada: ConfigOficial | null = null;

function montarOficial(j: Record<string, unknown>): ConfigOficial | null {
  const token = String(j.token ?? '').trim();
  const phoneNumberId = String(j.phone_number_id ?? '').trim();
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    modeloCodigo: String(j.modelo_codigo || 'festpag_codigo'),
    modeloIngresso: String(j.modelo_ingresso || 'festpag_ingresso'),
    idioma: String(j.idioma || 'pt_BR'),
    versao: String(j.versao || 'v25.0'),
  };
}

function oficialDoAmbiente(): ConfigOficial | null {
  return montarOficial({
    token: Deno.env.get('WHATSAPP_CLOUD_TOKEN'),
    phone_number_id: Deno.env.get('WHATSAPP_CLOUD_PHONE_ID'),
    modelo_codigo: Deno.env.get('WHATSAPP_CLOUD_MODELO_CODIGO'),
    modelo_ingresso: Deno.env.get('WHATSAPP_CLOUD_MODELO_INGRESSO'),
    idioma: Deno.env.get('WHATSAPP_CLOUD_IDIOMA'),
    versao: Deno.env.get('WHATSAPP_CLOUD_VERSAO'),
  });
}

async function carregarOficial(admin: any): Promise<void> {
  if (oficialCarregada) return;
  const env = oficialDoAmbiente();
  if (env) { oficialCarregada = env; return; }
  try {
    const { data, error } = await admin.rpc('ler_segredo', { _nome: 'whatsapp_cloud' });
    // Sem o segredo é o normal até a Meta liberar o número: não é erro.
    if (error || !data) return;
    oficialCarregada = montarOficial(JSON.parse(String(data)));
  } catch (e) {
    console.error('[WHATSAPP] segredo "whatsapp_cloud" inválido', e instanceof Error ? e.message : e);
  }
}

function oficial(): ConfigOficial | null {
  return oficialCarregada ?? oficialDoAmbiente();
}

/** A API oficial está configurada? (código e ingresso saem por ela) */
export function usaApiOficial(): boolean {
  return !!oficial();
}

function configDoAmbiente(): ConfigWhatsApp | null {
  const baseUrl = (Deno.env.get('EVOLUTION_BASE_URL') ?? '').replace(/\/+$/, '');
  const apiKey = Deno.env.get('EVOLUTION_API_KEY') ?? '';
  const instance = Deno.env.get('EVOLUTION_INSTANCE') ?? '';
  if (!baseUrl || !apiKey || !instance) return null;
  return { baseUrl, apiKey, instance };
}

/**
 * Carrega a configuração (ambiente → Vault) e a guarda para as próximas
 * chamadas da mesma instância da edge. `admin` = cliente com service role.
 * Carrega os dois caminhos (Evolution e API oficial). Devolve false quando
 * nenhum dos dois está configurado.
 */
export async function carregarConfigWhatsApp(admin: any): Promise<boolean> {
  await carregarOficial(admin);
  const evolution = await carregarEvolution(admin);
  return evolution || !!oficial();
}

async function carregarEvolution(admin: any): Promise<boolean> {
  if (configCarregada) return true;
  const env = configDoAmbiente();
  if (env) { configCarregada = env; return true; }
  try {
    const { data, error } = await admin.rpc('ler_segredo', { _nome: 'evolution' });
    if (error || !data) {
      console.error('[WHATSAPP] segredo "evolution" não lido do Vault', error?.message ?? 'vazio');
      return false;
    }
    const j = JSON.parse(String(data));
    const baseUrl = String(j.base_url ?? '').replace(/\/+$/, '');
    const apiKey = String(j.api_key ?? '');
    const instance = String(j.instance ?? '');
    if (!baseUrl || !apiKey || !instance) return false;
    configCarregada = { baseUrl, apiKey, instance };
    return true;
  } catch (e) {
    console.error('[WHATSAPP] segredo "evolution" inválido', e instanceof Error ? e.message : e);
    return false;
  }
}

function config(): ConfigWhatsApp | null {
  return configCarregada ?? configDoAmbiente();
}

/**
 * "(17) 99999-9999", "+55 17 99999 9999", "5517999999999" → "5517999999999".
 * Espelho de `public.normalizar_whatsapp` no banco. null = não é número brasileiro.
 */
export function normalizarNumeroBr(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

/** "5517999999999" → "(17) *****-9999": o que a tela mostra ao escolher o canal. */
export function mascararNumeroParaTela(numero: string): string {
  const s = numero.startsWith('55') ? numero.slice(2) : numero;
  const ddd = s.slice(0, 2);
  const fim = s.slice(-4);
  return `(${ddd}) *****-${fim}`;
}

/** Para log: nunca o número inteiro (LGPD). */
export function mascararNumero(numero: string): string {
  return `***${numero.slice(-4)}`;
}

type Resultado = { ok: true } | { ok: false; erro: string; status?: number };

async function chamar(
  cfg: ConfigWhatsApp,
  caminho: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${cfg.baseUrl}${caminho}/${encodeURIComponent(cfg.instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

/** Manda um texto. `numero` já normalizado (55DDDN). */
export async function enviarTextoWhatsApp(
  numero: string,
  texto: string,
  opts: { timeoutMs?: number } = {},
): Promise<Resultado> {
  const cfg = config();
  if (!cfg) return { ok: false, erro: 'whatsapp_nao_configurado' };
  try {
    const { status, json } = await chamar(cfg, '/message/sendText', { number: numero, text: texto }, opts.timeoutMs ?? 8_000);
    if (status >= 200 && status < 300) return { ok: true };
    console.error('[WHATSAPP] sendText', status, JSON.stringify(json).slice(0, 300));
    return { ok: false, erro: 'whatsapp_recusou', status };
  } catch (e) {
    console.error('[WHATSAPP] sendText falhou', e instanceof Error ? e.message : e);
    return { ok: false, erro: 'whatsapp_indisponivel' };
  }
}

/**
 * Manda uma imagem por URL pública (a Evolution não aceita base64 aqui —
 * mesma regra do `arya-send` da gestão). `legenda` vai junto da imagem.
 */
export async function enviarImagemWhatsApp(
  numero: string,
  imagemUrl: string,
  legenda: string,
  opts: { timeoutMs?: number; fileName?: string } = {},
): Promise<Resultado> {
  const cfg = config();
  if (!cfg) return { ok: false, erro: 'whatsapp_nao_configurado' };
  if (!/^https?:\/\//i.test(imagemUrl)) return { ok: false, erro: 'imagem_precisa_de_url' };
  try {
    const { status, json } = await chamar(
      cfg,
      '/message/sendMedia',
      { number: numero, mediatype: 'image', mimetype: 'image/png', caption: legenda, media: imagemUrl, fileName: opts.fileName ?? 'ingresso.png' },
      opts.timeoutMs ?? 20_000,
    );
    if (status >= 200 && status < 300) return { ok: true };
    console.error('[WHATSAPP] sendMedia', status, JSON.stringify(json).slice(0, 300));
    return { ok: false, erro: 'whatsapp_recusou', status };
  } catch (e) {
    console.error('[WHATSAPP] sendMedia falhou', e instanceof Error ? e.message : e);
    return { ok: false, erro: 'whatsapp_indisponivel' };
  }
}

/**
 * "Esse número tem WhatsApp?" — perguntar ANTES de mandar código para lá.
 * Devolve também o número no formato que a Evolution reconhece (ela às vezes
 * tira ou põe o 9 na frente) — é esse que deve ser usado no envio.
 * `null` = não deu para perguntar (servidor fora); quem chama decide.
 */
export async function numeroTemWhatsApp(
  numero: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ existe: boolean; numero: string } | null> {
  // Com a API oficial ligada, o fluxo do cliente não encosta na Evolution
  // (nem para perguntar). A Meta não tem essa consulta: quem chama segue em
  // frente e, se não chegar, a tela oferece reenviar ou o e-mail.
  if (usaApiOficial()) return null;
  const cfg = config();
  if (!cfg) return null;
  try {
    const { status, json } = await chamar(cfg, '/chat/whatsappNumbers', { numbers: [numero] }, opts.timeoutMs ?? 8_000);
    if (status < 200 || status >= 300 || !Array.isArray(json)) return null;
    const hit = json[0];
    const real = String(hit?.jid ?? '').split('@')[0] || numero;
    return { existe: !!hit?.exists, numero: real };
  } catch (e) {
    console.error('[WHATSAPP] whatsappNumbers falhou', e instanceof Error ? e.message : e);
    return null;
  }
}

// ── API oficial da Meta (WhatsApp Cloud API) ────────────────────────────────

/*
 * A Meta recusa variável vazia, com quebra de linha, tabulação ou mais de 4
 * espaços seguidos. Tudo que entra num modelo passa por aqui.
 */
function variavel(valor: unknown, max = 120): string {
  const t = String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || '-';
}

async function enviarModelo(
  cfg: ConfigOficial,
  numero: string,
  modelo: string,
  componentes: unknown[],
  timeoutMs: number,
): Promise<Resultado> {
  try {
    const res = await fetch(`https://graph.facebook.com/${cfg.versao}/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: numero,
        type: 'template',
        template: { name: modelo, language: { code: cfg.idioma }, components: componentes },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    // Só o código e a mensagem da Meta: o corpo pode ecoar o número.
    const e = json?.error ?? {};
    console.error('[WHATSAPP-OFICIAL]', modelo, res.status, e.code ?? '', e.error_subcode ?? '', String(e.message ?? '').slice(0, 200));
    return { ok: false, erro: 'whatsapp_recusou', status: res.status };
  } catch (e) {
    console.error('[WHATSAPP-OFICIAL]', modelo, 'falhou', e instanceof Error ? e.message : e);
    return { ok: false, erro: 'whatsapp_indisponivel' };
  }
}

/**
 * Código de acesso. Com a API oficial: modelo de AUTENTICAÇÃO da Meta (texto
 * fixo dela, com o botão "Copiar código"). Sem ela: o texto de sempre pela
 * Evolution (`textoEvolution`).
 */
export async function enviarCodigoWhatsApp(
  numero: string,
  codigo: string,
  textoEvolution: string,
  opts: { timeoutMs?: number } = {},
): Promise<Resultado> {
  const cfg = oficial();
  if (!cfg) return enviarTextoWhatsApp(numero, textoEvolution, opts);
  return enviarModelo(cfg, numero, cfg.modeloCodigo, [
    { type: 'body', parameters: [{ type: 'text', text: codigo }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
  ], opts.timeoutMs ?? 8_000);
}

export type DadosIngresso = {
  nome: string;
  evento: string;
  quando: string;
  local: string;
  /** "1 de 2" */
  posicao: string;
  titular: string;
  codigoCurto: string;
};

/**
 * Um ingresso. Com a API oficial: modelo de UTILIDADE com o QR no cabeçalho e
 * os dados do ingresso no corpo, um por ingresso. Sem ela: a imagem com a
 * legenda pela Evolution (`legendaEvolution`).
 * Ordem das variáveis do modelo: {{1}} nome · {{2}} evento · {{3}} quando ·
 * {{4}} local · {{5}} posição · {{6}} titular · {{7}} código curto.
 */
export async function enviarIngressoWhatsApp(
  numero: string,
  imagemUrl: string,
  dados: DadosIngresso,
  legendaEvolution: string,
  opts: { timeoutMs?: number; fileName?: string } = {},
): Promise<Resultado> {
  const cfg = oficial();
  if (!cfg) return enviarImagemWhatsApp(numero, imagemUrl, legendaEvolution, opts);
  if (!/^https:\/\//i.test(imagemUrl)) return { ok: false, erro: 'imagem_precisa_de_url' };
  return enviarModelo(cfg, numero, cfg.modeloIngresso, [
    { type: 'header', parameters: [{ type: 'image', image: { link: imagemUrl } }] },
    {
      type: 'body',
      parameters: [
        dados.nome, dados.evento, dados.quando, dados.local, dados.posicao, dados.titular, dados.codigoCurto,
      ].map((v) => ({ type: 'text', text: variavel(v) })),
    },
  ], opts.timeoutMs ?? 20_000);
}
