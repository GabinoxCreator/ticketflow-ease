/**
 * Cortesia em lote (OS-408, etapa 5, item 5.1): "Vários de uma vez".
 *
 * O produtor escolhe UM ingresso (lote) para a colada inteira (decisão do chat) e cola as
 * linhas `nome; CPF; e-mail; quantidade` (também vale a colada direto da planilha, com uma
 * coluna para cada). CPF e e-mail são obrigatórios (decisão do Gabriel de 09/11). Tudo é
 * conferido ANTES de gerar, inclusive a soma contra o que sobra do lote.
 *
 * Cada linha vira um pedido de cortesia com N ingressos, gerado um por um pela MESMA edge
 * de hoje (`producer-create-manual-sale`, via useManualSale, com `is_courtesy: true`): sem
 * edge nova e sem mexer nela. Se uma linha falhar no meio (estoque acabou, erro), para ali,
 * não desfaz as que já entraram e mostra a lista: entrou, falhou (com o motivo), não tentada.
 * Lote em grupo e lote "só pelo link" não entram, como na cortesia de uma pessoa.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEventLots } from '@/hooks/useEventLots';
import { useManualSale, type ErroDaVendaManual } from '@/hooks/useManualSale';
import { ehLoteEmGrupo } from '@/lib/lote-em-grupo';
import { unformatCPF, validateCPF } from '@/utils/cpfValidator';

export interface LinhaDaColada {
  numero: number;
  nome: string;
  cpf: string;
  email: string;
  quantidade: number;
  problemas: string[];
}

/** O mesmo teste de e-mail da edge (`producer-create-manual-sale`). */
const emailValido = (e: string) => /^\S+@\S+\.\S+$/.test(e);

/**
 * Lê a colada: uma pessoa por linha, colunas separadas por ";" (ou pela tabulação da
 * planilha). Linha em branco é ignorada. Quantidade vazia vale 1.
 */
export function lerColada(texto: string): LinhaDaColada[] {
  const linhas: LinhaDaColada[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    if (!bruta.trim()) return;
    const partes = (bruta.includes('\t') ? bruta.split('\t') : bruta.split(';')).map((p) => p.trim());
    const [nome = '', cpfBruto = '', email = '', qtdBruta = ''] = partes;
    const problemas: string[] = [];
    if (partes.length < 3) problemas.push('faltam colunas (nome; CPF; e-mail; quantidade)');
    if (nome.length < 3) problemas.push('nome muito curto');
    // CPF com menos de 11 dígitos (a planilha que cortou o zero da frente) é "CPF inválido": NÃO
    // se completa sozinho (revisão 2 da etapa 5). Completar acerta um CPF válido de OUTRA pessoa
    // em cerca de 1 de cada 100 erros de digitação, e a edge liga a cortesia à conta que tem
    // aquele CPF: o ingresso iria parar na conta de um desconhecido.
    const cpf = unformatCPF(cpfBruto);
    if (!(cpf.length === 11 && validateCPF(cpf))) problemas.push('CPF inválido');
    if (!emailValido(email)) problemas.push('e-mail inválido');
    const quantidade = qtdBruta === '' ? 1 : Number(qtdBruta);
    if (!Number.isInteger(quantidade) || quantidade < 1) problemas.push('quantidade inválida');
    linhas.push({ numero: i + 1, nome, cpf, email: email.toLowerCase(), quantidade: Number.isInteger(quantidade) ? quantidade : 0, problemas });
  });
  return linhas;
}

/**
 * Mesmo CPF em mais de uma linha (aviso, não trava: pode ser de propósito). Devolve, por CPF
 * repetido, os números das linhas.
 */
export function cpfsRepetidos(linhas: LinhaDaColada[]): number[][] {
  const porCpf = new Map<string, number[]>();
  for (const l of linhas) if (l.cpf.length === 11) porCpf.set(l.cpf, [...(porCpf.get(l.cpf) ?? []), l.numero]);
  return [...porCpf.values()].filter((ns) => ns.length > 1);
}

/** "2 e 5", "2, 5 e 7". */
const numerosDasLinhas = (ns: number[]) => (ns.length <= 1 ? String(ns[0] ?? '') : `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`);

/** Medido na prova de verdade de 16/11: 3 cortesias em 21,6 s (cerca de 7 s cada uma). */
const SEGUNDOS_POR_LINHA = 7;
function tempoPrevisto(linhas: number): string {
  const s = linhas * SEGUNDOS_POR_LINHA;
  if (s < 60) return 'Leva menos de 1 minuto. Não feche esta página até terminar.';
  const m = Math.round(s / 60);
  return `Leva cerca de ${m} ${m === 1 ? 'minuto' : 'minutos'}. Não feche esta página até terminar.`;
}

/** Linha que o servidor pode ter gravado, mas a resposta se perdeu (rede, erro interno). */
export const SEM_CONFIRMACAO_NA_LINHA = 'Sem confirmação: pode ter entrado. Confira em Pedidos antes de colar de novo.';

type Situacao = { linha: number; estado: 'entrou' | 'falhou' | 'sem_confirmacao' | 'nao_tentada'; motivo?: string };

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CortesiaEmLote({ eventId, onClose, onEstado }: {
  eventId: string;
  onClose: () => void;
  /** Avisa a janela: gerando (não deixa fechar nem trocar de modo no meio) e pronto (lista final). */
  onEstado?: (estado: 'editando' | 'gerando' | 'pronto') => void;
}) {
  const { lots, isLoading } = useEventLots(eventId);
  const mutation = useManualSale(eventId);
  const [loteId, setLoteId] = useState<string>('');
  const [texto, setTexto] = useState('');
  const [conferido, setConferido] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [resultado, setResultado] = useState<Situacao[] | null>(null);

  // Os mesmos lotes da cortesia de uma pessoa: ativos, não esgotados, sem grupo e sem "só pelo link".
  const lotes = useMemo(
    () => (lots ?? []).filter((l) => l.is_active && !l.manually_sold_out && !ehLoteEmGrupo(l) && !l.retirada_publica),
    [lots],
  );
  const lote = lotes.find((l) => l.id === loteId);
  const sobra = lote ? Math.max(0, lote.total_quantity - lote.sold_quantity - (lote.reserved_quantity || 0)) : 0;

  const linhas = useMemo(() => lerColada(texto), [texto]);
  const soma = linhas.reduce((s, l) => s + (l.quantidade || 0), 0);
  const comProblema = linhas.filter((l) => l.problemas.length > 0);
  const passaDoLote = !!lote && soma > sobra;
  const pode = !!lote && linhas.length > 0 && comProblema.length === 0 && !passaDoLote;
  const repetidos = useMemo(() => cpfsRepetidos(linhas), [linhas]);

  // Enquanto gera, fechar a aba ou recarregar pergunta antes (o navegador mostra o aviso dele):
  // sair no meio perde a lista do que entrou e do que falta.
  useEffect(() => {
    if (!gerando) return;
    const segura = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', segura);
    return () => window.removeEventListener('beforeunload', segura);
  }, [gerando]);

  const gerar = async () => {
    if (!pode || !lote) return;
    setGerando(true);
    onEstado?.('gerando');
    setFeitas(0);
    const sit: Situacao[] = linhas.map((l) => ({ linha: l.numero, estado: 'nao_tentada' }));
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      let tentativas = 0;
      // O servidor aceita até 30 vendas por minuto de cada produtor: se ele pedir para
      // esperar, espera e tenta a MESMA linha de novo (até 3 vezes). Outro erro: para aqui.
      for (;;) {
        try {
          await mutation.mutateAsync({
            event_id: eventId,
            buyer: { name: l.nome, cpf: l.cpf, email: l.email, whatsapp: null },
            items: [{ lot_id: lote.id, quantity: l.quantidade }],
            is_courtesy: true,
            note: null,
          });
          sit[i] = { linha: l.numero, estado: 'entrou' };
          break;
        } catch (e) {
          const err = e as ErroDaVendaManual;
          if (err.code === 'rate_limited' && tentativas < 3) {
            tentativas += 1;
            await espera(((err.retry_after ?? 20) + 1) * 1000);
            continue;
          }
          // A resposta se perdeu (rede, erro interno): pode ter entrado. Não é "falhou": é conferir
          // em Pedidos antes de colar de novo, e o lote para aqui (revisão 1 da etapa 5).
          sit[i] = err.semConfirmacao
            ? { linha: l.numero, estado: 'sem_confirmacao' }
            : { linha: l.numero, estado: 'falhou', motivo: err.message || 'erro' };
          break;
        }
      }
      setFeitas(i + 1);
      if (sit[i].estado !== 'entrou') break;
    }
    setResultado(sit);
    setGerando(false);
    onEstado?.('pronto');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (resultado) {
    const entraram = resultado.filter((r) => r.estado === 'entrou').length;
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium" data-testid="resumo-do-lote">{entraram} de {resultado.length} cortesias geradas.</p>
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {resultado.map((r) => {
            const l = linhas.find((x) => x.numero === r.linha)!;
            return (
              <li key={r.linha} data-estado={r.estado} className="flex items-start gap-2 text-sm rounded-lg border bg-card/50 px-3 py-2">
                {r.estado === 'entrou' ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  : r.estado === 'falhou' ? <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  : r.estado === 'sem_confirmacao' ? <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  : <MinusCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{l.nome}</span>{' '}
                  <span className="text-muted-foreground">· {l.quantidade} {l.quantidade === 1 ? 'ingresso' : 'ingressos'}</span>
                  <span className={`block text-xs ${r.estado === 'falhou' ? 'text-destructive' : r.estado === 'sem_confirmacao' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                    {r.estado === 'entrou' ? 'Entrou' : r.estado === 'falhou' ? `Falhou: ${r.motivo}` : r.estado === 'sem_confirmacao' ? SEM_CONFIRMACAO_NA_LINHA : 'Não tentada'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Ingresso</Label>
        <Select value={loteId} onValueChange={(v) => { setLoteId(v); setConferido(false); }} disabled={gerando}>
          <SelectTrigger aria-label="Ingresso das cortesias">
            <SelectValue placeholder="Escolha o ingresso" />
          </SelectTrigger>
          <SelectContent>
            {lotes.map((l) => {
              const s = Math.max(0, l.total_quantity - l.sold_quantity - (l.reserved_quantity || 0));
              return <SelectItem key={l.id} value={l.id} disabled={s === 0}>{l.name} · {s === 0 ? 'Esgotado' : `${s} disponíveis`}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cortesia-lote">Cole uma pessoa por linha: nome; CPF; e-mail; quantidade</Label>
        <Textarea
          id="cortesia-lote"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setConferido(false); }}
          placeholder={'Ana Silva; 000.000.000-00; ana@email.com; 2\nBruno Lima; 000.000.000-00; bruno@email.com; 1'}
          className="min-h-[140px] font-mono text-xs"
          disabled={gerando}
        />
        <p className="text-[11px] text-muted-foreground">Pode colar direto da planilha, com uma coluna para cada.</p>
      </div>

      {conferido && linhas.length > 0 && (
        <div className="rounded-xl border border-primary/10 bg-background/40 p-3 text-sm space-y-1.5" data-testid="conferencia-do-lote">
          <p>
            {linhas.length} {linhas.length === 1 ? 'pessoa' : 'pessoas'} · {soma} {soma === 1 ? 'ingresso' : 'ingressos'}
            {lote ? ` · restam ${sobra} neste ingresso` : ''}
          </p>
          {comProblema.map((l) => (
            <p key={l.numero} className="text-xs text-destructive">Linha {l.numero}: {l.problemas.join(', ')}</p>
          ))}
          {passaDoLote && (
            <p className="text-xs text-destructive">São {soma} ingressos e só restam {sobra} neste ingresso.</p>
          )}
          {!lote && <p className="text-xs text-destructive">Escolha o ingresso.</p>}
          {repetidos.map((ns) => (
            <p key={ns.join('-')} className="text-xs text-amber-600 dark:text-amber-400">Linhas {numerosDasLinhas(ns)} têm o mesmo CPF: confira se não está repetido.</p>
          ))}
          {pode && <p className="text-xs text-muted-foreground" data-testid="tempo-previsto">{tempoPrevisto(linhas.length)}</p>}
        </div>
      )}

      {gerando && (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Gerando {Math.min(feitas + 1, linhas.length)} de {linhas.length}...</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={gerando}>Cancelar</Button>
        {!conferido || !pode ? (
          <Button variant="outline" onClick={() => setConferido(true)} disabled={!texto.trim() || gerando}>
            Conferir lista
          </Button>
        ) : (
          <Button onClick={gerar} disabled={gerando} className="bg-gradient-to-r from-primary to-pink-500 hover:opacity-90 text-white">
            Gerar {linhas.length} {linhas.length === 1 ? 'cortesia' : 'cortesias'}
          </Button>
        )}
      </div>
    </div>
  );
}
