// Tela de entrada dos convites com lista de alunos (OS-346, Balé da Bruna).
//
// Antes do mapa: a família informa o CPF e a data de nascimento do aluno, a
// tela mostra só o PRIMEIRO nome (para conferir que digitou a criança certa),
// quantos convites restam e as sessões. Quem decide é o banco: esta tela não
// sabe quem está na lista e não guarda o CPF nem o nascimento (fica só o passe
// que o banco devolve). Errar não diz se o CPF existe na lista.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, CalendarClock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthModalV2 } from '@/components/auth/AuthModalV2';
import { useAuth } from '@/contexts/AuthContext';
import { formatCPF, unformatCPF, validateCPF } from '@/utils/cpfValidator';
import { horaCurta } from '@/lib/eventTime';
import {
  conferirAluno, guardarAluno, quandoAbre,
  type AlunoConferido, type InfoDaLista, type SessaoDaLista,
} from '@/hooks/useListaDeAlunos';

interface Props {
  eventId: string;
  lista: InfoDaLista;
  /** Aluno já conferido nesta aba: a tela pula direto para a escolha da sessão. */
  aluno: AlunoConferido | null;
  onAluno: (a: AlunoConferido | null) => void;
  /** A família escolheu a sessão em que já está: mostra o mapa. */
  onSessaoAtual: () => void;
}

/** "dd/mm/aaaa" enquanto digita. */
function mascaraData(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "dd/mm/aaaa" -> "aaaa-mm-dd", ou null se não for uma data de verdade. */
function dataIso(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const d = new Date(Number(aaaa), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(aaaa) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
  if (Number(aaaa) < 1990 || d.getTime() > Date.now()) return null;
  return `${aaaa}-${mm}-${dd}`;
}

function nomeDaSessao(s: SessaoDaLista, i: number): string {
  const [, mes, dia] = (s.date ?? '').split('-');
  const quando = [dia && mes ? `${dia}/${mes}` : '', horaCurta(s.time)].filter(Boolean).join(' · ');
  return `${i + 1}ª sessão${quando ? ` · ${quando}` : ''}`;
}

export function EntradaDoAluno({ eventId, lista, aluno, onAluno, onSessaoAtual }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [authAberto, setAuthAberto] = useState(false);
  // Quem digitou antes de entrar na conta: confere assim que a conta abrir.
  const [conferirAoEntrar, setConferirAoEntrar] = useState(false);

  const sessoes = lista.sessoes ?? [];
  const limite = lista.limite_por_aluno ?? 4;

  const conferir = async () => {
    setErro(null);
    const digitos = unformatCPF(cpf);
    if (!validateCPF(digitos)) { setErro('Confira o CPF do aluno.'); return; }
    const iso = dataIso(nascimento);
    if (!iso) { setErro('Confira a data de nascimento (dia/mês/ano).'); return; }
    if (!user) { setConferirAoEntrar(true); setAuthAberto(true); return; }
    setEnviando(true);
    try {
      const r = await conferirAluno(eventId, digitos, iso);
      if ('aluno' in r) {
        guardarAluno(r.aluno);
        onAluno(r.aluno);
        setCpf('');
        setNascimento('');
        return;
      }
      const motivo = r.motivo;
      if (motivo === 'nao_encontrado') {
        setErro('Não encontramos um aluno com esse CPF e essa data de nascimento. Confira os dados. Se estiver tudo certo, fale com a escola.');
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-6 sm:py-10">
        {!aluno ? (
          <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display font-bold text-xl leading-tight">Convites para as famílias dos alunos</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Para comprar, informe o CPF e a data de nascimento do aluno.
                </p>
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); void conferir(); }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="cpf-aluno">CPF do aluno</Label>
                <Input
                  id="cpf-aluno"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(formatCPF(e.target.value))}
                  maxLength={14}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nascimento-aluno">Data de nascimento do aluno</Label>
                <Input
                  id="nascimento-aluno"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="dd/mm/aaaa"
                  value={nascimento}
                  onChange={(e) => setNascimento(mascaraData(e.target.value))}
                  maxLength={10}
                />
              </div>

              {erro && (
                <p role="alert" className="text-sm text-destructive leading-relaxed">{erro}</p>
              )}

              <Button type="submit" variant="hero" size="lg" className="w-full" disabled={enviando}>
                {enviando
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conferindo…</>
                  : user ? 'Continuar' : 'Entrar e continuar'}
              </Button>
            </form>

            <ul className="text-xs text-muted-foreground space-y-1.5 border-t border-border pt-4">
              <li>Cada aluno tem {limite} convites, somando as duas sessões.</li>
              <li>Irmãos têm {limite} convites cada um: informe um aluno de cada vez.</li>
              {lista.abre_lote1_em && (
                <li>
                  A venda abre em {quandoAbre(lista.abre_lote1_em)} para quem dança uma sessão
                  {lista.abre_lote2_em ? ` e em ${quandoAbre(lista.abre_lote2_em)} para quem dança as duas` : ''}.
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Convites de</p>
              <h1 className="font-display font-bold text-2xl leading-tight">{aluno.primeiro_nome}</h1>
              <p className="text-sm mt-1">
                {aluno.restantes > 0
                  ? <>Restam <strong className="tabular-nums">{aluno.restantes}</strong> de {aluno.limite} convites.</>
                  : <>Os {aluno.limite} convites deste aluno já foram usados.</>}
              </p>
            </div>

            {!aluno.liberado && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                <span>A venda para este aluno abre em {quandoAbre(aluno.abre_em)}. Você já pode olhar o mapa.</span>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Escolha a sessão</p>
              {sessoes.map((s, i) => (
                <Button
                  key={s.event_id}
                  type="button"
                  variant={s.event_id === eventId ? 'hero' : 'outline'}
                  size="lg"
                  className="w-full justify-between"
                  onClick={() => escolherSessao(s)}
                >
                  <span>{nomeDaSessao(s, i)}</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ))}
            </div>

            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
              onClick={() => onAluno(null)}
            >
              Não é {aluno.primeiro_nome}? Informar outro aluno
            </button>
          </div>
        )}
      </div>

      <AuthModalV2
        isOpen={authAberto}
        onClose={() => { setAuthAberto(false); setConferirAoEntrar(false); }}
        onAuthenticated={() => setAuthAberto(false)}
      />
    </div>
  );
}
