// Tela de entrada dos convites com lista de alunos (OS-346, Balé da Bruna;
// modelo novo e tela cheia na OS-365).
//
// Antes do mapa: a família informa o CPF do aluno, a tela mostra só o PRIMEIRO
// nome (para conferir que digitou o aluno certo), quantos convites restam e só
// as sessões em que o aluno dança. Quem decide é o banco: esta tela não sabe
// quem está na lista e não guarda o CPF (fica só o passe que o banco devolve).
// Ocupa o celular inteiro, com a capa do evento ao fundo, o passo a passo e a
// janela "Como funciona" (abre sozinha uma vez por aba). Textos aprovados pelo
// Gabriel em 03/11 (ficha da OS-365).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Armchair, CalendarCheck, CalendarClock, CreditCard,
  HelpCircle, IdCard, Loader2, MapPin, ShieldCheck, Ticket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AuthModalV2 } from '@/components/auth/AuthModalV2';
import { useAuth } from '@/contexts/AuthContext';
import { formatCPF, unformatCPF, validateCPF } from '@/utils/cpfValidator';
import { horaCurta } from '@/lib/eventTime';
import {
  conferirAluno, guardarAluno, quandoAbre, sessoesDoAluno,
  type AlunoConferido, type InfoDaLista, type SessaoDaLista,
} from '@/hooks/useListaDeAlunos';

export interface EventoDaEntrada {
  title: string;
  slug?: string | null;
  image_url?: string | null;
  venue?: string | null;
  city?: string | null;
  state?: string | null;
}

interface Props {
  eventId: string;
  evento: EventoDaEntrada;
  lista: InfoDaLista;
  /** Aluno já conferido nesta aba: a tela pula direto para a escolha da sessão. */
  aluno: AlunoConferido | null;
  onAluno: (a: AlunoConferido | null) => void;
  /** A família escolheu a sessão em que já está: mostra o mapa. */
  onSessaoAtual: () => void;
}

const CHAVE_COMO_FUNCIONA = 'festpag:como-funciona-lista';

function diaMes(date: string | undefined): string {
  const [, mes, dia] = (date ?? '').split('-');
  return dia && mes ? `${dia}/${mes}` : '';
}

/** "Alice através da Dança · 1ª sessão" -> "Alice através da Dança". */
function tituloSemSessao(t: string): string {
  const i = t.lastIndexOf(' · ');
  return i > 0 && /sessão$/i.test(t) ? t.slice(0, i) : t;
}

const PASSOS = ['CPF', 'Sessão', 'Poltronas', 'Pagamento'] as const;

function Passos({ atual }: { atual: number }) {
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-medium" aria-label="Passos da compra">
      {PASSOS.map((p, i) => (
        <li key={p} className="flex items-center gap-1.5 min-w-0">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-1 transition-colors ${
              i === atual ? 'bg-white text-[#14102a]' : i < atual ? 'bg-white/25 text-white' : 'bg-white/10 text-white/60'
            }`}
            aria-current={i === atual ? 'step' : undefined}
          >
            <span className="tabular-nums">{i + 1}</span>
            <span className={i === atual ? '' : 'hidden min-[380px]:inline'}>{p}</span>
          </span>
          {i < PASSOS.length - 1 && <span className="h-px w-2 bg-white/25 shrink-0" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

/** Os convites do aluno, desenhados: cheio = ainda pode usar. */
function Convites({ limite, restantes }: { limite: number; restantes: number }) {
  return (
    <div className="flex gap-2" aria-hidden="true">
      {Array.from({ length: limite }).map((_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 10, rotate: -8 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 260, damping: 18 }}
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
            i < restantes ? 'border-amber-200/60 bg-amber-200/15 text-amber-100' : 'border-white/10 bg-white/5 text-white/25'
          }`}
        >
          <Ticket className="h-5 w-5" />
        </motion.span>
      ))}
    </div>
  );
}

function ComoFunciona({ aberto, onFechar, limite }: { aberto: boolean; onFechar: () => void; limite: number }) {
  const itens = [
    { icone: IdCard, titulo: 'Informe o CPF do aluno', texto: 'Os convites são só para as famílias dos alunos da escola. O CPF confirma que o aluno está na lista e mostra quantos convites ele ainda tem.' },
    { icone: CalendarCheck, titulo: 'Escolha a sessão', texto: 'Cada aluno compra só na sessão em que dança.' },
    { icone: Armchair, titulo: 'Escolha as poltronas', texto: `Toque nas poltronas livres no mapa, até ${limite} por aluno, somando as sessões. Elas ficam reservadas por 10 minutos enquanto você paga.` },
    { icone: CreditCard, titulo: 'Pague por PIX ou cartão', texto: 'Os convites aparecem em Meus Ingressos, com a sessão e a poltrona.' },
  ];
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Como funciona</DialogTitle>
          <DialogDescription>Leva menos de 2 minutos.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-4 mt-1">
          {itens.map((it, i) => (
            <motion.li
              key={it.titulo}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 + i * 0.07 }}
              className="flex gap-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <it.icone className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{i + 1}. {it.titulo}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{it.texto}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <p className="flex gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground leading-relaxed">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          O CPF do aluno serve só para conferir a lista. Ele não vai no seu pedido nem no convite.
        </p>
        <Button variant="hero" size="lg" className="w-full" onClick={onFechar}>Entendi</Button>
      </DialogContent>
    </Dialog>
  );
}

export function EntradaDoAluno({ eventId, evento, lista, aluno, onAluno, onSessaoAtual }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [authAberto, setAuthAberto] = useState(false);
  // Quem digitou antes de entrar na conta: confere assim que a conta abrir.
  const [conferirAoEntrar, setConferirAoEntrar] = useState(false);
  const [comoFunciona, setComoFunciona] = useState(false);

  const limite = lista.limite_por_aluno ?? 4;
  // Só as sessões em que o aluno dança; a deste link pode não ser uma delas.
  const permitidas = sessoesDoAluno(lista, aluno);
  const sessaoErrada = !!aluno && lista.sessao != null && !(aluno.sessoes ?? []).includes(lista.sessao);
  const numeros = (aluno?.sessoes ?? []).slice().sort((a, b) => a - b);
  const sessoes = lista.sessoes ?? [];
  const titulo = tituloSemSessao(sessoes[0]?.title ?? evento.title);
  const dia = diaMes(sessoes[0]?.date);
  const cidade = evento.city && evento.state ? `${evento.city}/${evento.state}` : evento.city;
  const local = [evento.venue, cidade].filter(Boolean).join(' · ');
  const aindaNaoAbriu = !!lista.abre_em && new Date(lista.abre_em).getTime() > Date.now();

  // A janela "Como funciona" abre sozinha na primeira visita desta aba.
  useEffect(() => {
    if (aluno) return;
    try {
      if (!sessionStorage.getItem(CHAVE_COMO_FUNCIONA)) {
        // A marca de "já mostrei" só é gravada quando a janela abre de fato.
        const t = setTimeout(() => {
          try { sessionStorage.setItem(CHAVE_COMO_FUNCIONA, '1'); } catch { /* nada */ }
          setComoFunciona(true);
        }, 600);
        return () => clearTimeout(t);
      }
    } catch { /* sem storage: não abre sozinha */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conferir = async () => {
    setErro(null);
    const digitos = unformatCPF(cpf);
    if (!validateCPF(digitos)) { setErro('Confira o CPF do aluno.'); return; }
    if (!user) { setConferirAoEntrar(true); setAuthAberto(true); return; }
    setEnviando(true);
    try {
      const r = await conferirAluno(eventId, digitos);
      if ('aluno' in r) {
        guardarAluno(r.aluno);
        onAluno(r.aluno);
        setCpf('');
        return;
      }
      const motivo = r.motivo;
      if (motivo === 'nao_encontrado') {
        setErro('Não encontramos um aluno com esse CPF. Confira os números. Se estiver tudo certo, fale com a escola.');
      } else if (motivo === 'muitas_tentativas') {
        setErro('Muitas tentativas seguidas. Espere um pouco e tente de novo.');
      } else {
        setErro('Não foi possível conferir agora. Tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (user && conferirAoEntrar) {
      setConferirAoEntrar(false);
      void conferir();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, conferirAoEntrar]);

  const escolherSessao = (s: SessaoDaLista) => {
    if (s.event_id === eventId) { onSessaoAtual(); return; }
    navigate(`/evento/${s.slug ?? s.event_id}/mapa`);
  };

  return (
    // Por cima do cabeçalho do mapa (z-40: as janelas do Radix ficam em z-50).
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#0b0a1a] text-white">
      {/* Fundo: a capa do evento, desfocada */}
      {evento.image_url && (
        <div
          className="pointer-events-none fixed inset-0 scale-125 bg-cover bg-center opacity-45 blur-2xl"
          style={{ backgroundImage: `url(${evento.image_url})` }}
          aria-hidden="true"
        />
      )}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-[#0b0a1a]/40 via-[#0b0a1a]/80 to-[#0b0a1a]" aria-hidden="true" />

      <div className="relative mx-auto flex min-h-full max-w-md flex-col px-4 pb-8 pt-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(`/evento/${evento.slug ?? eventId}`)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setComoFunciona(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/20"
          >
            <HelpCircle className="h-4 w-4" /> Como funciona
          </button>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mt-4">
          {evento.image_url && (
            <div className="overflow-hidden rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10">
              <img src={evento.image_url} alt="" className="aspect-[16/9] w-full object-cover" />
            </div>
          )}
          <h1 className="mt-4 font-display text-2xl font-bold leading-tight">{titulo}</h1>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/70">
            {dia && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-4 w-4" />
                {dia} · {sessoes.map((s) => horaCurta(s.time)).filter(Boolean).join(' e ')}
              </span>
            )}
            {local && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{local}</span>}
          </div>
        </motion.div>

        <div className="mt-5"><Passos atual={aluno ? 1 : 0} /></div>

        <AnimatePresence mode="wait">
          {!aluno ? (
            <motion.div
              key="cpf"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="mt-4 rounded-3xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xl"
            >
              <h2 className="font-display text-xl font-bold leading-tight">Convites para as famílias dos alunos</h2>
              <p className="mt-1 text-sm text-white/75">Para comprar, informe o CPF do aluno.</p>

              <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void conferir(); }}>
                <div className="space-y-1.5">
                  <Label htmlFor="cpf-aluno" className="text-white/85">CPF do aluno</Label>
                  <Input
                    id="cpf-aluno"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(formatCPF(e.target.value))}
                    maxLength={14}
                    className="h-14 rounded-xl border-white/20 bg-white/95 text-center text-xl tracking-wider text-[#14102a] placeholder:text-[#14102a]/35"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setComoFunciona(true)}
                  className="inline-flex items-center gap-1 text-xs text-white/70 underline underline-offset-4 hover:text-white"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Por que o CPF do aluno?
                </button>

                <AnimatePresence>
                  {erro && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-xl bg-red-500/15 px-3 py-2 text-sm leading-relaxed text-red-100"
                    >
                      {erro}
                    </motion.p>
                  )}
                </AnimatePresence>

                <Button type="submit" variant="hero" size="lg" className="w-full text-base" disabled={enviando}>
                  {enviando
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Conferindo…</>
                    : user ? 'Continuar' : 'Entrar e continuar'}
                </Button>
              </form>

              <ul className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs text-white/70">
                <li className="flex gap-2"><Ticket className="h-4 w-4 shrink-0 text-white/50" />Cada aluno tem {limite} convites, somando as duas sessões.</li>
                <li className="flex gap-2"><IdCard className="h-4 w-4 shrink-0 text-white/50" />Irmãos têm {limite} convites cada um: informe um aluno de cada vez.</li>
                <li className="flex gap-2"><CalendarCheck className="h-4 w-4 shrink-0 text-white/50" />Cada aluno compra só na sessão em que dança.</li>
                {aindaNaoAbriu && (
                  <li className="flex gap-2"><CalendarClock className="h-4 w-4 shrink-0 text-white/50" />A venda abre em {quandoAbre(lista.abre_em)}.</li>
                )}
              </ul>
            </motion.div>
          ) : (
            <motion.div
              key="aluno"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              className="mt-4 rounded-3xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-xl"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Convites de</p>
              <h2 className="bg-gradient-to-r from-amber-100 via-amber-200 to-amber-50 bg-clip-text font-display text-4xl font-bold leading-tight text-transparent">
                {aluno.primeiro_nome}
              </h2>
              <div className="mt-3"><Convites limite={aluno.limite} restantes={aluno.restantes} /></div>
              <p className="mt-2 text-sm text-white/80">
                {aluno.restantes > 0
                  ? <>Restam <strong className="tabular-nums text-white">{aluno.restantes}</strong> de {aluno.limite} convites.</>
                  : <>Os {aluno.limite} convites deste aluno já foram usados.</>}
              </p>

              {!aluno.liberado && new Date(aluno.abre_em).getTime() > Date.now() && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                  <span>A venda para este aluno abre em {quandoAbre(aluno.abre_em)}. Você já pode olhar o mapa.</span>
                </div>
              )}

              <div className="mt-5 space-y-2.5">
                {sessaoErrada ? (
                  // O link era de uma sessão em que o aluno não dança.
                  <p className="text-sm font-medium">
                    Os convites de {aluno.primeiro_nome} são para a {numeros.map((n) => `${n}ª`).join(' e a ')} sessão, a sessão em que dança.
                  </p>
                ) : permitidas.length === 1 ? (
                  <p className="text-sm font-medium">
                    {aluno.primeiro_nome} dança na {permitidas[0].sessao}ª sessão: os convites são para essa sessão.
                  </p>
                ) : (
                  <>
                    {/* Quem dança nas duas compra uma sessão por vez (decisão do Gabriel, 03/11). */}
                    <div className="flex gap-2 rounded-xl border border-white/15 bg-white/[0.06] p-3 text-sm leading-relaxed text-white/85">
                      <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                      <span>
                        {aluno.primeiro_nome} dança nas duas sessões. A compra é feita uma sessão por vez: escolha uma, pague,
                        e depois volte aqui para a outra. Os {aluno.limite} convites somam as duas.
                      </span>
                    </div>
                    <p className="text-sm font-medium">Escolha a sessão</p>
                  </>
                )}
                {permitidas.map((s, i) => (
                  <motion.button
                    key={s.event_id}
                    type="button"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.25 + i * 0.08 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => escolherSessao(s)}
                    className="group flex w-full items-center gap-4 rounded-2xl bg-gradient-to-r from-[#7c3aed] via-[#c026d3] to-[#ec4899] p-4 text-left shadow-lg shadow-fuchsia-900/30"
                  >
                    <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/15 leading-none">
                      <span className="font-display text-lg font-bold">{s.sessao}ª</span>
                      <span className="text-[10px] uppercase tracking-wider text-white/80">sessão</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg font-bold">
                        {sessaoErrada ? `Ir para a ${s.sessao}ª sessão` : `${diaMes(s.date)} · ${horaCurta(s.time)}`}
                      </span>
                      <span className="block text-xs text-white/80">
                        {sessaoErrada ? `${diaMes(s.date)} · ${horaCurta(s.time)}` : 'Ver o mapa de poltronas'}
                      </span>
                    </span>
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </motion.button>
                ))}
              </div>

              <button
                type="button"
                className="mt-5 w-full text-xs text-white/60 underline underline-offset-4 hover:text-white"
                onClick={() => onAluno(null)}
              >
                Não é {aluno.primeiro_nome}? Informar outro aluno
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ComoFunciona aberto={comoFunciona} onFechar={() => setComoFunciona(false)} limite={limite} />
      <AuthModalV2
        isOpen={authAberto}
        onClose={() => { setAuthAberto(false); setConferirAoEntrar(false); }}
        onAuthenticated={() => setAuthAberto(false)}
      />
    </div>
  );
}
