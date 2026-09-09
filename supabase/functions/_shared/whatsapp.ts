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
 */

export type ConfigWhatsApp = { baseUrl: string; apiKey: string; instance: string };

let configCarregada: ConfigWhatsApp | null = null;

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
 * Devolve false quando não há configuração em lugar nenhum.
 */
export async function carregarConfigWhatsApp(admin: any): Promise<boolean> {
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
