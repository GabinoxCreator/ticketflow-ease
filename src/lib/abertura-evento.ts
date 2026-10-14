// Link de abertura de evento (OS-221, 13/10/2026).
//
// Fechou um evento: a FestPag gera um link no admin e manda ao produtor. Ele responde
// uma pergunta por tela, sem login e sem nada obrigatório (o que fica para trás leva um
// motivo). A conta e o evento em rascunho a equipe cria pelo admin
// (`abertura_criar_rascunho`), que nunca publica sozinho.
//
// As funções do banco moram em supabase/migrations/20261013200000_abertura_de_evento.sql.
import { supabase } from '@/integrations/supabase/client';
import { supabasePublic } from '@/integrations/supabase/publicClient';

export type InicioDoLote = 'now' | 'scheduled' | 'after_lot';

export interface LoteAbertura {
  id: string;            // id local: o "abre quando o anterior esgotar" aponta por ele
  setor: string;
  nome: string;
  preco: string;         // texto, como foi digitado ("180" ou "180,50")
  preco_valor?: number | null; // o mesmo preço convertido; é o que o banco lê
  quantidade: string;
  inicio: InicioDoLote;
  inicio_data?: string;  // yyyy-mm-dd
  inicio_hora?: string;  // HH:MM
  fim_data?: string;
  fim_hora?: string;
}

export interface PessoaAcesso {
  id: string;
  nome: string;
  funcao: string;
  whatsapp: string;
}

export interface RespostasAbertura {
  produtora: {
    nome_site?: string;
    tipo_pessoa?: 'pj' | 'pf';
    razao_social?: string;
    documento?: string;
    responsavel_nome?: string;
    email?: string;
    whatsapp?: string;
    logo_url?: string;
  };
  evento: {
    titulo?: string;
    categoria?: string;
    descricao?: string;
    classificacao?: string;
    publico?: boolean;
  };
  local: {
    data_inicio?: string;
    hora_inicio?: string;
    data_fim?: string;
    hora_fim?: string;
    local?: string;
    cidade?: string;
    uf?: string;
    endereco?: string;
  };
  ingressos: {
    lotes: LoteAbertura[];
    meia?: string;
    cupons?: string;
    cortesias?: string;
  };
  arte: { imagem_url?: string };
  acessos: { pessoas: PessoaAcesso[] };
}

/** { id da pergunta: motivo }: o que o produtor deixou para depois, e por quê. */
export type PendenciasAbertura = Record<string, string>;

export interface Abertura {
  cliente: string;
  taxa_percent: number;
  respostas: RespostasAbertura;
  pendencias: PendenciasAbertura;
  etapa_atual: number;
  enviada_em: string | null;
  rascunho_criado: boolean;
}

export type EtapaComDados = 'produtora' | 'evento' | 'local' | 'ingressos' | 'arte' | 'acessos';

/** Uma pergunta por tela, nesta ordem (pedido do Gabriel, 13/10: "um passo a passo"). */
export const PERGUNTAS: { id: string; grupo: EtapaComDados; titulo: string; exemplo: string }[] = [
  { id: 'nome_site', grupo: 'produtora', titulo: 'Qual o nome da produtora?', exemplo: 'É o nome que aparece na página do evento como quem realiza. Ex.: Fogo & Fumaça Festival.' },
  { id: 'logo', grupo: 'produtora', titulo: 'Mande a logo', exemplo: 'Em boa qualidade, de preferência PNG com fundo transparente. Arte quadrada fica melhor.' },
  { id: 'empresa', grupo: 'produtora', titulo: 'Em nome de quem é a conta?', exemplo: 'Empresa ou pessoa física. É quem aparece nos recibos e no repasse.' },
  { id: 'responsavel', grupo: 'produtora', titulo: 'Quem vai cuidar da conta?', exemplo: 'O e-mail vira o login do painel de vendas. É por ele que vocês acompanham tudo.' },
  { id: 'titulo', grupo: 'evento', titulo: 'Qual o nome do evento?', exemplo: 'É o título da página de venda. Ex.: Fogo & Fumaça Festival 2026.' },
  { id: 'descricao', grupo: 'evento', titulo: 'Conte sobre o evento', exemplo: 'O que é, o que está incluso, atrações e horários. Vira o texto da página de venda.' },
  { id: 'quando', grupo: 'local', titulo: 'Quando acontece?', exemplo: 'Dia e horário de início e de fim.' },
  { id: 'onde', grupo: 'local', titulo: 'Onde vai ser?', exemplo: 'O nome do lugar e o endereço completo, para o mapa e o ingresso.' },
  { id: 'publico', grupo: 'evento', titulo: 'Para quem é o evento?', exemplo: 'Idade mínima, se menor entra acompanhado, e se a venda é aberta a todos ou só por link.' },
  { id: 'ingressos', grupo: 'ingressos', titulo: 'Quais ingressos vão vender?', exemplo: 'Um por linha: setor, nome, preço e quantidade. O preço é sem a taxa, que é somada para quem compra.' },
  { id: 'extras', grupo: 'ingressos', titulo: 'Vai ter meia-entrada, cupom ou cortesia?', exemplo: 'Se não tiver, é só seguir.' },
  { id: 'arte', grupo: 'arte', titulo: 'Mande a arte do evento', exemplo: '1920 × 1080 px, com a logo e a data no meio da altura. Não tem? A FestPag pode criar a partir da logo.' },
  { id: 'acessos', grupo: 'acessos', titulo: 'Quem mais precisa de acesso?', exemplo: 'Quem acompanha as vendas ou trabalha na portaria. A FestPag cria o acesso de cada um.' },
];

export const NOMES_DOS_GRUPOS: Record<EtapaComDados, string> = {
  produtora: 'A produtora', evento: 'O evento', local: 'Data e local', ingressos: 'Ingressos', arte: 'A arte', acessos: 'Acessos',
};

export const novoId = () => Math.random().toString(36).slice(2, 10);

export const loteVazio = (setor = 'Pista'): LoteAbertura => ({
  id: novoId(), setor, nome: '', preco: '', quantidade: '', inicio: 'now',
});

export function respostasVazias(): RespostasAbertura {
  return {
    produtora: { tipo_pessoa: 'pj' },
    evento: { publico: true },
    local: { uf: 'SP' },
    ingressos: { lotes: [loteVazio()] },
    arte: {},
    acessos: { pessoas: [] },
  };
}

/** Junta o que veio do banco com o formato vazio (respostas antigas ou parciais). */
export function completarRespostas(r: Partial<RespostasAbertura> | null | undefined): RespostasAbertura {
  const base = respostasVazias();
  const v = r ?? {};
  return {
    produtora: { ...base.produtora, ...(v.produtora ?? {}) },
    evento: { ...base.evento, ...(v.evento ?? {}) },
    local: { ...base.local, ...(v.local ?? {}) },
    ingressos: {
      ...base.ingressos,
      ...(v.ingressos ?? {}),
      lotes: v.ingressos?.lotes?.length ? v.ingressos.lotes : base.ingressos.lotes,
    },
    arte: { ...(v.arte ?? {}) },
    acessos: { pessoas: v.acessos?.pessoas ?? [] },
  };
}

/** "180,50" -> 180.5 ; vazio ou inválido -> null */
export function lerPreco(texto: string | undefined): number | null {
  if (!texto) return null;
  let s = String(texto).replace(/[^\d.,]/g, '');
  if (!s) return null;
  // Com vírgula, ela é o decimal e os pontos são milhar ("1.250,50").
  // Sem vírgula, um ponto seguido de 1 ou 2 dígitos é decimal ("180.5"); senão é milhar ("1.250").
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** O que o comprador paga: preço + taxa combinada no link (mesma conta do checkout). */
export function precoComTaxa(preco: number, taxaPercent: number) {
  const taxa = Math.round(preco * taxaPercent) / 100;
  return { taxa, total: Math.round((preco + taxa) * 100) / 100 };
}

/** Etapa "tem alguma coisa" (para a revisão e o admin mostrarem o que chegou). */
export function etapaPreenchida(r: RespostasAbertura, etapa: EtapaComDados): boolean {
  switch (etapa) {
    case 'produtora': return !!(r.produtora.nome_site || r.produtora.email || r.produtora.responsavel_nome);
    case 'evento': return !!(r.evento.titulo || r.evento.descricao);
    case 'local': return !!(r.local.data_inicio || r.local.local);
    case 'ingressos': return r.ingressos.lotes.some((l) => l.nome && lerPreco(l.preco) !== null);
    case 'arte': return !!r.arte.imagem_url;
    case 'acessos': return r.acessos.pessoas.some((p) => p.nome);
  }
}

// ---------------------------------------------------------------- banco (sem login)

const rpcPublico = (nome: string, args: Record<string, unknown>) =>
  (supabasePublic.rpc as unknown as (n: string, a: Record<string, unknown>) => ReturnType<typeof supabasePublic.rpc>)(nome, args);

export async function lerAbertura(token: string): Promise<Abertura | null> {
  const { data, error } = await rpcPublico('abertura_ler', { _token: token });
  if (error) throw error;
  if (!data) return null;
  const a = data as unknown as Abertura;
  return { ...a, respostas: completarRespostas(a.respostas), pendencias: a.pendencias ?? {} };
}

export async function salvarAbertura(token: string, respostas: RespostasAbertura, pendencias: PendenciasAbertura, etapa: number) {
  const comValor: RespostasAbertura = {
    ...respostas,
    ingressos: {
      ...respostas.ingressos,
      lotes: respostas.ingressos.lotes.map((l) => ({ ...l, preco_valor: lerPreco(l.preco) })),
    },
  };
  const { error } = await rpcPublico('abertura_salvar', {
    _token: token, _respostas: comValor, _pendencias: pendencias, _etapa: etapa,
  });
  if (error) throw error;
}

export async function enviarAbertura(token: string) {
  const { error } = await rpcPublico('abertura_enviar', { _token: token });
  if (error) throw error;
}

/** Envia logo ou arte para a pasta do link (o banco só aceita com código válido). */
export async function enviarImagem(token: string, arquivo: File, tipo: 'logo' | 'arte'): Promise<string> {
  const permitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!permitidos.includes(arquivo.type)) throw new Error('Envie JPG, PNG, WebP ou GIF.');
  if (arquivo.size > 5 * 1024 * 1024) throw new Error('O arquivo passa de 5 MB.');
  const ext = (arquivo.name.split('.').pop() || 'png').toLowerCase();
  const caminho = `${token}/${tipo}-${Date.now()}.${ext}`;
  const { error } = await supabasePublic.storage.from('aberturas-evento').upload(caminho, arquivo, {
    cacheControl: '3600', upsert: false, contentType: arquivo.type,
  });
  if (error) throw error;
  return supabasePublic.storage.from('aberturas-evento').getPublicUrl(caminho).data.publicUrl;
}

// ---------------------------------------------------------------- banco (admin)

export async function criarRascunho(aberturaId: string, producerProfileId?: string | null) {
  const { data, error } = await (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>)(
    'abertura_criar_rascunho', { _abertura_id: aberturaId, _producer_profile_id: producerProfileId ?? null },
  );
  if (error) throw error;
  return data as unknown as string;
}

/** Mensagens do banco em língua de gente. */
export function explicarErro(e: unknown): string {
  const m = (e as { message?: string })?.message ?? '';
  if (m.includes('ja_criado')) return 'O evento já foi criado pela FestPag a partir deste link. Para mudar algo, fale com a gente.';
  if (m.includes('link_invalido')) return 'Este link não existe mais. Peça um novo para a FestPag.';
  if (m.includes('grande_demais')) return 'Tem texto demais em algum campo. Encurte e tente de novo.';
  if (m.includes('falta_data')) return 'Falta a data de início do evento.';
  if (m.includes('sem_produtor')) return 'Escolha o produtor dono do evento.';
  if (m.includes('so_admin')) return 'Só a equipe da FestPag pode criar o evento.';
  return m || 'Algo deu errado. Tente de novo.';
}
