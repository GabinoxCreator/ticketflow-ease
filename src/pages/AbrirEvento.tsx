// /abrir-evento/:token — o link de abertura de evento (OS-221, 13/10/2026).
//
// Fechou um evento: a FestPag manda este link e o produtor responde UMA PERGUNTA POR
// TELA, com um exemplo pequeno embaixo (pedido do Gabriel: "algo mais simples para
// colher os dados, um passo a passo"). Nada é obrigatório: "Ainda não sei" guarda o
// motivo. Feito para o celular. Tudo salva sozinho e o mesmo link continua de onde
// parou. PÚBLICA de propósito: quem recebe ainda não tem conta (a equipe cria depois).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, ImagePlus, Loader2, PartyPopper, Pencil, Plus, Trash2, Undo2, Upload,
} from 'lucide-react';
import logoFestpag from '@/assets/logo-festpag.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import WhatsAppInput from '@/components/WhatsAppInput';
import { CATEGORIAS_ESCOLHIVEIS } from '@/lib/categorias-de-evento';
import { formatCNPJ } from '@/utils/cnpjValidator';
import { formatCPF } from '@/utils/cpfValidator';
import {
  PERGUNTAS, enviarAbertura, enviarImagem, explicarErro, lerAbertura, lerPreco, loteVazio, novoId, precoComTaxa, reais, salvarAbertura,
  type Abertura, type LoteAbertura, type PendenciasAbertura, type RespostasAbertura,
} from '@/lib/abertura-evento';
import { cn } from '@/lib/utils';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const campo = 'h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';
const TOTAL = PERGUNTAS.length;
const TELA_REVISAO = TOTAL + 1;

type Muda = (f: (r: RespostasAbertura) => RespostasAbertura) => void;

function Campo({ rotulo, children }: { rotulo?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5">{rotulo && <Label className="text-sm font-semibold">{rotulo}</Label>}{children}</div>;
}

function EnviarImagem({ token, url, tipo, onPronto }: { token: string; url?: string; tipo: 'logo' | 'arte'; onPronto: (u: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const escolher = async (f?: File) => {
    if (!f) return;
    setEnviando(true);
    try { onPronto(await enviarImagem(token, f, tipo)); toast.success('Imagem recebida.'); }
    catch (e) { toast.error(explicarErro(e)); }
    finally { setEnviando(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div className="space-y-3">
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
      <button type="button" onClick={() => ref.current?.click()} disabled={enviando}
        className={cn('flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground transition hover:border-primary/50',
          tipo === 'logo' ? 'aspect-square max-w-[220px]' : 'aspect-video')}>
        {enviando ? <Loader2 className="h-8 w-8 animate-spin" />
          : url ? <img src={url} alt="" className={cn('h-full w-full', tipo === 'logo' ? 'object-contain p-4' : 'object-cover')} />
          : <><ImagePlus className="h-8 w-8" /><span className="text-sm font-medium">Toque para escolher</span></>}
      </button>
      {url && <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => ref.current?.click()}><Upload className="mr-2 h-4 w-4" /> Trocar</Button>}
      <p className="text-xs text-muted-foreground">JPG ou PNG, até 5 MB. Arquivo original, nunca print.</p>
    </div>
  );
}

// ---------------------------------------------------------------- as respostas de cada pergunta

function Resposta({ id, r, muda, token, avancar }: { id: string; r: RespostasAbertura; muda: Muda; token: string; avancar: () => void }) {
  const setP = (k: keyof RespostasAbertura['produtora'], v: string) => muda((x) => ({ ...x, produtora: { ...x.produtora, [k]: v } }));
  const setE = (k: keyof RespostasAbertura['evento'], v: string | boolean) => muda((x) => ({ ...x, evento: { ...x.evento, [k]: v } }));
  const setL = (k: keyof RespostasAbertura['local'], v: string) => muda((x) => ({ ...x, local: { ...x.local, [k]: v } }));
  const enter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); avancar(); } };
  const p = r.produtora, ev = r.evento, l = r.local;
  const pj = p.tipo_pessoa !== 'pf';

  switch (id) {
    case 'nome_site':
      return <Input autoFocus className={campo} value={p.nome_site ?? ''} onChange={(e) => setP('nome_site', e.target.value)} onKeyDown={enter} placeholder="Nome da produtora" />;
    case 'logo':
      return <EnviarImagem token={token} url={p.logo_url} tipo="logo" onPronto={(u) => setP('logo_url', u)} />;
    case 'empresa':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            {(['pj', 'pf'] as const).map((t) => (
              <button key={t} type="button" onClick={() => muda((x) => ({ ...x, produtora: { ...x.produtora, tipo_pessoa: t, documento: '' } }))}
                className={cn('h-11 rounded-lg text-sm font-semibold transition', (p.tipo_pessoa ?? 'pj') === t ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                {t === 'pj' ? 'Empresa' : 'Pessoa física'}
              </button>
            ))}
          </div>
          <Campo rotulo={pj ? 'Razão social' : 'Nome completo'}><Input className={campo} value={p.razao_social ?? ''} onChange={(e) => setP('razao_social', e.target.value)} /></Campo>
          <Campo rotulo={pj ? 'CNPJ' : 'CPF'}>
            <Input className={campo} inputMode="numeric" value={p.documento ?? ''} onKeyDown={enter}
              onChange={(e) => setP('documento', pj ? formatCNPJ(e.target.value) : formatCPF(e.target.value))} placeholder={pj ? '00.000.000/0000-00' : '000.000.000-00'} />
          </Campo>
        </div>
      );
    case 'responsavel':
      return (
        <div className="space-y-4">
          <Campo rotulo="Nome"><Input className={campo} value={p.responsavel_nome ?? ''} onChange={(e) => setP('responsavel_nome', e.target.value)} /></Campo>
          <Campo rotulo="E-mail"><Input className={campo} type="email" inputMode="email" value={p.email ?? ''} onChange={(e) => setP('email', e.target.value.trim())} placeholder="nome@empresa.com" /></Campo>
          <Campo rotulo="WhatsApp"><WhatsAppInput value={p.whatsapp ?? ''} onChange={(v) => setP('whatsapp', v)} /></Campo>
        </div>
      );
    case 'titulo':
      return <Input autoFocus className={campo} value={ev.titulo ?? ''} onChange={(e) => setE('titulo', e.target.value)} onKeyDown={enter} maxLength={150} placeholder="Nome do evento" />;
    case 'descricao':
      return (
        <div className="space-y-4">
          <Textarea autoFocus className="min-h-[180px] rounded-xl text-base" value={ev.descricao ?? ''} onChange={(e) => setE('descricao', e.target.value)}
            placeholder="Ex.: O maior festival de churrasco da região, com open bar, open food, shows ao vivo e área kids..." />
          <Campo rotulo="Tipo de evento">
            <select className={campo} value={ev.categoria ?? ''} onChange={(e) => setE('categoria', e.target.value)}>
              <option value="">Escolher depois</option>
              {CATEGORIAS_ESCOLHIVEIS.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
            </select>
          </Campo>
        </div>
      );
    case 'quando':
      return (
        <div className="space-y-4">
          <p className="text-sm font-semibold">Começa</p>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Input className={campo} type="date" value={l.data_inicio ?? ''} onChange={(e) => setL('data_inicio', e.target.value)} aria-label="Dia de início" />
            <Input className={campo} type="time" value={l.hora_inicio ?? ''} onChange={(e) => setL('hora_inicio', e.target.value)} aria-label="Hora de início" />
          </div>
          <p className="text-sm font-semibold">Termina</p>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Input className={campo} type="date" value={l.data_fim ?? ''} onChange={(e) => setL('data_fim', e.target.value)} aria-label="Dia do fim" />
            <Input className={campo} type="time" value={l.hora_fim ?? ''} onChange={(e) => setL('hora_fim', e.target.value)} aria-label="Hora do fim" />
          </div>
        </div>
      );
    case 'onde':
      return (
        <div className="space-y-4">
          <Campo rotulo="Nome do lugar"><Input className={campo} value={l.local ?? ''} onChange={(e) => setL('local', e.target.value)} placeholder="Ex.: Complexo Swift" /></Campo>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <Campo rotulo="Cidade"><Input className={campo} value={l.cidade ?? ''} onChange={(e) => setL('cidade', e.target.value)} /></Campo>
            <Campo rotulo="Estado"><select className={campo} value={l.uf ?? 'SP'} onChange={(e) => setL('uf', e.target.value)}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
          </div>
          <Campo rotulo="Endereço"><Input className={campo} value={l.endereco ?? ''} onChange={(e) => setL('endereco', e.target.value)} onKeyDown={enter} placeholder="Rua, número e bairro" /></Campo>
        </div>
      );
    case 'publico':
      return (
        <div className="space-y-5">
          <Campo rotulo="Classificação"><Input className={campo} value={ev.classificacao ?? ''} onChange={(e) => setE('classificacao', e.target.value)} placeholder="Ex.: 18 anos. Menores só com os pais." /></Campo>
          <div className="space-y-2">
            <Label className="text-sm font-semibold">A venda é</Label>
            {[{ v: true, t: 'Aberta a todos', d: 'O evento aparece na vitrine do site.' }, { v: false, t: 'Só por link', d: 'Só compra quem recebe o endereço.' }].map((o) => (
              <button key={String(o.v)} type="button" onClick={() => setE('publico', o.v)}
                className={cn('flex w-full items-center gap-3 rounded-xl border p-4 text-left transition', (ev.publico ?? true) === o.v ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border bg-card')}>
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', (ev.publico ?? true) === o.v ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>
                  {(ev.publico ?? true) === o.v && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <span><span className="block font-semibold">{o.t}</span><span className="block text-xs text-muted-foreground">{o.d}</span></span>
              </button>
            ))}
          </div>
        </div>
      );
    case 'ingressos':
      return <ListaDeIngressos r={r} muda={muda} />;
    case 'extras': {
      const set = (k: 'meia' | 'cupons' | 'cortesias', v: string) => muda((x) => ({ ...x, ingressos: { ...x.ingressos, [k]: v } }));
      return (
        <div className="space-y-4">
          <Campo rotulo="Meia-entrada"><Textarea className="rounded-xl text-base" value={r.ingressos.meia ?? ''} onChange={(e) => set('meia', e.target.value)} placeholder="Ex.: estudante, metade do preço, com carteirinha na entrada" /></Campo>
          <Campo rotulo="Cupons de desconto"><Textarea className="rounded-xl text-base" value={r.ingressos.cupons ?? ''} onChange={(e) => set('cupons', e.target.value)} placeholder="Ex.: PARCEIRO10, 10% de desconto, 50 usos, até 30/11" /></Campo>
          <Campo rotulo="Cortesias e listas"><Textarea className="rounded-xl text-base" value={r.ingressos.cortesias ?? ''} onChange={(e) => set('cortesias', e.target.value)} placeholder="Ex.: lista dos patrocinadores, 40 pessoas" /></Campo>
        </div>
      );
    }
    case 'arte':
      return <EnviarImagem token={token} url={r.arte.imagem_url} tipo="arte" onPronto={(u) => muda((x) => ({ ...x, arte: { imagem_url: u } }))} />;
    case 'acessos':
      return <ListaDePessoas r={r} muda={muda} />;
    default:
      return null;
  }
}

function ListaDeIngressos({ r, muda }: { r: RespostasAbertura; muda: Muda }) {
  const lotes = r.ingressos.lotes;
  // Cada ingresso é uma linha de resumo; só o que a pessoa toca abre para editar.
  const [aberto, setAberto] = useState<string | null>(() => (lotes.length === 1 && !lotes[0].nome ? lotes[0].id : null));
  const setLote = (id: string, patch: Partial<LoteAbertura>) =>
    muda((x) => ({ ...x, ingressos: { ...x.ingressos, lotes: x.ingressos.lotes.map((l) => (l.id === id ? { ...l, ...patch } : l)) } }));
  const adicionar = () => {
    const novo = loteVazio(lotes.at(-1)?.setor || 'Pista');
    muda((x) => ({ ...x, ingressos: { ...x.ingressos, lotes: [...x.ingressos.lotes, novo] } }));
    setAberto(novo.id);
  };
  const remover = (id: string) => muda((x) => ({ ...x, ingressos: { ...x.ingressos, lotes: x.ingressos.lotes.filter((l) => l.id !== id) } }));
  return (
    <div className="space-y-3">
      {lotes.map((l, i) => {
        const preco = lerPreco(l.preco);
        if (aberto !== l.id) {
          return (
            <button key={l.id} type="button" onClick={() => setAberto(l.id)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left">
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate font-semibold', !l.nome && 'text-muted-foreground')}>{l.setor || 'Setor'} · {l.nome || 'sem nome'}</span>
                <span className="block truncate text-sm text-muted-foreground">{preco !== null ? reais(preco) : 'sem preço'} · {l.quantidade || '?'} ingressos</span>
              </span>
              <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          );
        }
        return (
          <div key={l.id} className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-4">
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Setor"><Input className={campo} value={l.setor} onChange={(e) => setLote(l.id, { setor: e.target.value })} placeholder="Pista, VIP..." /></Campo>
              <Campo rotulo="Nome"><Input className={campo} value={l.nome} onChange={(e) => setLote(l.id, { nome: e.target.value })} placeholder="1º lote" /></Campo>
              <Campo rotulo="Preço (R$)"><Input className={campo} inputMode="decimal" value={l.preco} onChange={(e) => setLote(l.id, { preco: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0,00" /></Campo>
              <Campo rotulo="Quantidade"><Input className={campo} inputMode="numeric" value={l.quantidade} onChange={(e) => setLote(l.id, { quantidade: e.target.value.replace(/\D/g, '') })} placeholder="300" /></Campo>
            </div>
            <Campo rotulo="Começa a vender">
              <select className={campo} value={l.inicio} onChange={(e) => setLote(l.id, { inicio: e.target.value as LoteAbertura['inicio'] })}>
                <option value="now">Assim que a venda abrir</option>
                <option value="scheduled">Numa data e hora</option>
                {i > 0 && <option value="after_lot">Quando o de cima esgotar</option>}
              </select>
            </Campo>
            {l.inicio === 'scheduled' && (
              <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                <Input className={campo} type="date" value={l.inicio_data ?? ''} onChange={(e) => setLote(l.id, { inicio_data: e.target.value })} aria-label="Dia em que começa" />
                <Input className={campo} type="time" value={l.inicio_hora ?? ''} onChange={(e) => setLote(l.id, { inicio_hora: e.target.value })} aria-label="Hora em que começa" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              {lotes.length > 1 && <Button type="button" variant="ghost" className="h-11 rounded-xl text-muted-foreground" onClick={() => remover(l.id)}><Trash2 className="mr-1.5 h-4 w-4" /> Remover</Button>}
              <Button type="button" variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setAberto(null)}><Check className="mr-2 h-4 w-4" /> Pronto</Button>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" className="h-12 w-full rounded-xl" onClick={adicionar}><Plus className="mr-2 h-4 w-4" /> Outro ingresso</Button>
    </div>
  );
}

function ListaDePessoas({ r, muda }: { r: RespostasAbertura; muda: Muda }) {
  const pessoas = r.acessos.pessoas;
  const setP = (id: string, patch: Record<string, string>) => muda((x) => ({ ...x, acessos: { pessoas: x.acessos.pessoas.map((p) => (p.id === id ? { ...p, ...patch } : p)) } }));
  const add = () => muda((x) => ({ ...x, acessos: { pessoas: [...x.acessos.pessoas, { id: novoId(), nome: '', funcao: 'vendas', whatsapp: '' }] } }));
  const del = (id: string) => muda((x) => ({ ...x, acessos: { pessoas: x.acessos.pessoas.filter((p) => p.id !== id) } }));
  return (
    <div className="space-y-3">
      {pessoas.map((p) => (
        <div key={p.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex gap-2">
            <Input className={campo} value={p.nome} onChange={(e) => setP(p.id, { nome: e.target.value })} placeholder="Nome" />
            <Button type="button" variant="ghost" size="icon" className="h-12 w-12 shrink-0 text-muted-foreground" onClick={() => del(p.id)} aria-label="Remover pessoa"><Trash2 className="h-4 w-4" /></Button>
          </div>
          <select className={campo} value={p.funcao} onChange={(e) => setP(p.id, { funcao: e.target.value })}>
            <option value="vendas">Acompanhar as vendas</option>
            <option value="portaria">Trabalhar na portaria</option>
            <option value="os dois">Os dois</option>
          </select>
          <WhatsAppInput value={p.whatsapp} onChange={(v) => setP(p.id, { whatsapp: v })} />
        </div>
      ))}
      <Button type="button" variant="outline" className="h-12 w-full rounded-xl" onClick={add}><Plus className="mr-2 h-4 w-4" /> {pessoas.length ? 'Outra pessoa' : 'Adicionar pessoa'}</Button>
    </div>
  );
}

/** O que a pessoa respondeu, em uma linha (para a revisão). Vazio = não respondeu. */
function resumo(id: string, r: RespostasAbertura): string {
  const p = r.produtora, ev = r.evento, l = r.local;
  const data = (d?: string) => (d ? d.split('-').reverse().join('/') : '');
  switch (id) {
    case 'nome_site': return p.nome_site ?? '';
    case 'logo': return p.logo_url ? 'Enviada' : '';
    case 'empresa': return [p.razao_social, p.documento].filter(Boolean).join(' · ');
    case 'responsavel': return [p.responsavel_nome, p.email, p.whatsapp].filter(Boolean).join(' · ');
    case 'titulo': return ev.titulo ?? '';
    case 'descricao': return ev.descricao ?? '';
    case 'quando': return [data(l.data_inicio), l.hora_inicio].filter(Boolean).join(' às ');
    case 'onde': return [l.local, l.cidade].filter(Boolean).join(', ');
    case 'publico': return ev.classificacao ? `${ev.classificacao} · ${ev.publico === false ? 'só por link' : 'aberta a todos'}` : '';
    case 'ingressos': {
      const ok = r.ingressos.lotes.filter((x) => x.nome && lerPreco(x.preco) !== null);
      return ok.length ? `${ok.length} ingresso${ok.length > 1 ? 's' : ''}` : '';
    }
    case 'extras': return [r.ingressos.meia && 'meia', r.ingressos.cupons && 'cupons', r.ingressos.cortesias && 'cortesias'].filter(Boolean).join(', ');
    case 'arte': return r.arte.imagem_url ? 'Enviada' : '';
    case 'acessos': { const n = r.acessos.pessoas.filter((x) => x.nome).length; return n ? `${n} pessoa${n > 1 ? 's' : ''}` : ''; }
    default: return '';
  }
}

// ---------------------------------------------------------------- a página

export default function AbrirEvento() {
  const { token = '' } = useParams<{ token: string }>();
  const [abertura, setAbertura] = useState<Abertura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [r, setR] = useState<RespostasAbertura | null>(null);
  const [pend, setPend] = useState<PendenciasAbertura>({});
  const [tela, setTela] = useState(0);
  const [salvo, setSalvo] = useState<'ok' | 'salvando' | 'erro'>('ok');
  const [motivoAberto, setMotivoAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const primeira = useRef(true);

  const recarregar = useCallback(async () => {
    try {
      const a = await lerAbertura(token);
      setAbertura(a);
      if (a && primeira.current) {
        setR(a.respostas); setPend(a.pendencias);
        setTela(a.enviada_em ? 0 : Math.min(a.etapa_atual, TELA_REVISAO));
      }
    } catch { setAbertura(null); }
    finally { setCarregando(false); }
  }, [token]);
  useEffect(() => { recarregar(); }, [recarregar]);

  // Salva sozinho, 800 ms depois da última mudança.
  useEffect(() => {
    if (!r || !abertura || abertura.rascunho_criado) return;
    if (primeira.current) { primeira.current = false; return; }
    setSalvo('salvando');
    const t = setTimeout(() => {
      salvarAbertura(token, r, pend, tela).then(() => setSalvo('ok')).catch((e) => { setSalvo('erro'); toast.error(explicarErro(e)); });
    }, 800);
    return () => clearTimeout(t);
  }, [r, pend, tela, token, abertura]);

  const muda: Muda = useCallback((f) => setR((x) => (x ? f(x) : x)), []);
  const ir = (i: number) => { setMotivoAberto(false); setMotivo(''); setTela(Math.max(0, Math.min(TELA_REVISAO, i))); window.scrollTo({ top: 0 }); };
  const pergunta = tela >= 1 && tela <= TOTAL ? PERGUNTAS[tela - 1] : null;

  const deixarParaDepois = () => {
    if (!pergunta) return;
    setPend((p) => ({ ...p, [pergunta.id]: motivo.trim() || 'Sem motivo informado' }));
    ir(tela + 1);
  };

  const enviar = async () => {
    setEnviando(true);
    try { await salvarAbertura(token, r!, pend, tela); await enviarAbertura(token); await recarregar(); setTela(0); window.scrollTo({ top: 0 }); }
    catch (e) { toast.error(explicarErro(e)); }
    finally { setEnviando(false); }
  };

  if (carregando) return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!abertura || !r) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center">
        <img src={logoFestpag} alt="FestPag" className="h-8" />
        <h1 className="font-display text-2xl font-bold">Este link não existe</h1>
        <p className="max-w-sm text-muted-foreground">Confira se ele veio inteiro na mensagem, ou peça um novo para a FestPag.</p>
      </div>
    );
  }

  const enviado = !!abertura.enviada_em && tela === 0;

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-5">
          <img src={logoFestpag} alt="FestPag" className="h-6" />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {pergunta && <span className="mr-2 font-medium tabular-nums">{tela} de {TOTAL}</span>}
            {salvo === 'salvando' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : salvo === 'erro' ? 'Não salvou' : <Check className="h-3.5 w-3.5 text-green-600" />}
          </span>
        </div>
        {tela > 0 && !enviado && (
          <div className="h-1 bg-muted"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${(Math.min(tela, TOTAL) / TOTAL) * 100}%` }} /></div>
        )}
      </header>

      <main className="mx-auto max-w-lg px-5 pb-40 pt-8">
        <AnimatePresence mode="wait">
          <motion.div key={enviado ? 'fim' : tela} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
            {enviado ? (
              <section className="py-10 text-center">
                <PartyPopper className="mx-auto h-12 w-12 text-primary" />
                <h1 className="mt-4 font-display text-3xl font-bold">Recebemos, {abertura.cliente}!</h1>
                <p className="mt-3 text-muted-foreground">
                  {abertura.rascunho_criado
                    ? 'A FestPag já está montando o seu evento. Você confere a página antes de a venda abrir.'
                    : 'A FestPag monta a conta e o evento e te chama para conferir antes de abrir a venda.'}
                </p>
                {!abertura.rascunho_criado && (
                  <Button variant="outline" className="mt-8 h-12 rounded-xl" onClick={() => {
                    const primeiraPendente = PERGUNTAS.findIndex((q) => q.id in pend);
                    ir(primeiraPendente >= 0 ? primeiraPendente + 1 : TELA_REVISAO);
                  }}>
                    {Object.keys(pend).length ? `Completar o que ficou para depois (${Object.keys(pend).length})` : 'Rever minhas respostas'}
                  </Button>
                )}
              </section>
            ) : tela === 0 ? (
              <section className="py-6">
                <p className="text-sm font-semibold uppercase tracking-widest text-primary">Abertura do evento</p>
                <h1 className="mt-3 font-display text-4xl font-bold leading-tight">Oi, {abertura.cliente}! Vamos montar o seu evento.</h1>
                <p className="mt-4 text-lg text-muted-foreground">São {TOTAL} perguntas rápidas, uma por vez. Com elas a FestPag cria a sua conta, a página do evento e os ingressos.</p>
                <ul className="mt-6 space-y-3 text-base">
                  <li className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-primary" /> Não sabe alguma? Toque em "Ainda não sei" e siga.</li>
                  <li className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-primary" /> Salva sozinho: pode parar e voltar por este link.</li>
                  <li className="flex gap-3"><Check className="mt-1 h-5 w-5 shrink-0 text-primary" /> Nada vai ao ar sem você conferir.</li>
                </ul>
              </section>
            ) : pergunta ? (
              <section className="space-y-6">
                <h1 className="font-display text-3xl font-bold leading-tight">{pergunta.titulo}</h1>
                {pend[pergunta.id] && (
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="flex-1">Ficou para depois: <b>{pend[pergunta.id]}</b></p>
                    <button type="button" className="flex items-center gap-1 text-xs font-semibold text-primary" onClick={() => setPend((p) => { const n = { ...p }; delete n[pergunta.id]; return n; })}>
                      <Undo2 className="h-3.5 w-3.5" /> Responder
                    </button>
                  </div>
                )}
                <Resposta id={pergunta.id} r={r} muda={muda} token={token} avancar={() => ir(tela + 1)} />
                <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{pergunta.exemplo}</p>
                {pergunta.id === 'ingressos' && abertura.taxa_percent > 0 && (() => {
                  const primeiro = r.ingressos.lotes.map((x) => lerPreco(x.preco)).find((x) => x !== null && x > 0);
                  return primeiro ? <p className="text-sm text-muted-foreground">Ex.: um ingresso de {reais(primeiro)} sai por <b className="text-foreground">{reais(precoComTaxa(primeiro, abertura.taxa_percent).total)}</b> para quem compra ({String(abertura.taxa_percent).replace('.', ',')}% de taxa).</p> : null;
                })()}
              </section>
            ) : (
              <section className="space-y-6">
                <h1 className="font-display text-3xl font-bold leading-tight">Tudo certo?</h1>
                <p className="text-muted-foreground">Toque numa resposta para mudar.</p>
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                  {PERGUNTAS.map((q, i) => {
                    const txt = resumo(q.id, r);
                    return (
                      <button key={q.id} type="button" onClick={() => ir(i + 1)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                        {pend[q.id] ? <Clock3 className="h-5 w-5 shrink-0 text-amber-500" /> : txt ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> : <span className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{q.titulo}</span>
                          <span className="block truncate text-xs text-muted-foreground">{pend[q.id] ? `Para depois: ${pend[q.id]}` : txt || 'Sem resposta'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {!enviado && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {motivoAberto && (
            <div className="mx-auto max-w-lg space-y-2 px-5 pt-4">
              <Label className="text-sm font-semibold">O que falta, e por quê?</Label>
              <Textarea autoFocus className="rounded-xl text-base" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: ainda estou vendo com a equipe" />
            </div>
          )}
          <div className="mx-auto flex max-w-lg items-center gap-2 px-5 py-3">
            {tela === 0 ? (
              <Button className="h-12 w-full rounded-xl text-base" onClick={() => ir(1)}>Começar <ArrowRight className="ml-2 h-4 w-4" /></Button>
            ) : tela === TELA_REVISAO ? (
              <>
                <Button variant="ghost" className="h-12 rounded-xl" onClick={() => ir(tela - 1)} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button>
                <Button className="h-12 flex-1 rounded-xl text-base" onClick={enviar} disabled={enviando}>
                  {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar para a FestPag
                </Button>
              </>
            ) : motivoAberto ? (
              <>
                <Button variant="ghost" className="h-12 rounded-xl" onClick={() => setMotivoAberto(false)}>Cancelar</Button>
                <Button className="h-12 flex-1 rounded-xl" onClick={deixarParaDepois}>Guardar e seguir</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" className="h-12 rounded-xl" onClick={() => ir(tela - 1)} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></Button>
                {pergunta && !pend[pergunta.id] && (
                  <Button variant="outline" className="h-12 rounded-xl" onClick={() => setMotivoAberto(true)}>Ainda não sei</Button>
                )}
                <Button className="h-12 flex-1 rounded-xl text-base" onClick={() => ir(tela + 1)}>Próxima <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
