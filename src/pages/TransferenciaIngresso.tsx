import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Loader2, Ticket, Calendar, MapPin, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatEventDate } from '@/lib/eventTime';
import { AceiteDoIngresso } from '@/components/tickets/AceiteDoIngresso';
import FacialCaptureFullscreen from '@/components/auth/FacialCaptureFullscreen';
import FacialInviteModal from '@/components/auth/FacialInviteModal';
import { registrarConviteFacial } from '@/lib/conviteFacialLog';

/*
 * Página do link de transferência — o que QUEM RECEBE vê.
 *
 * Ela precisa dar conta de alguém que provavelmente nunca usou a FestPag,
 * chegando por um link do WhatsApp. Por isso, nesta ordem: primeiro mostra o
 * ingresso (para a pessoa reconhecer o convite), depois pede o cadastro, e só
 * então o aceite. Pedir cadastro antes de dizer do que se trata é o jeito mais
 * rápido de a pessoa fechar a aba.
 *
 * O CPF é a trava: só quem tem o CPF que o dono apontou consegue aceitar. Por
 * isso a tela mostra os 3 últimos dígitos — para a pessoa saber, antes de
 * digitar, se o convite é mesmo para ela.
 */

interface Info {
  status: string;
  expiraEm: string;
  deQuem: string;
  cpfFinal: string;
  /** Já existe conta com o CPF de destino. Muda a tela de "criar" para "entrar". */
  jaTemConta?: boolean;
  /** E-mail mascarado dessa conta, para a pessoa se reconhecer. */
  emailMascarado?: string | null;
  evento: { titulo: string; data: string; hora: string; local: string; cidade: string; estado: string; imagem: string | null } | null;
  ingresso: { lote: string | null; assento: string | null };
  /** Evento com entrada pela facial (lote de retirada pública, OS-357): pede a facial depois do aceite. */
  exigeFacial?: boolean;
}

const formatCpf = (v: string) =>
  v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

export default function TransferenciaIngresso() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [info, setInfo] = useState<Info | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [cpf, setCpf] = useState('');
  const [processando, setProcessando] = useState(false);
  const [pronto, setPronto] = useState(false);
  // Tocou "Seguir sem facial" (OS-374): o aceite não volta mais ao convite.
  const seguiuSemFacial = useRef(false);
  // Evento com entrada pela facial (OS-357): a facial vem ANTES do aceite. O aceite que
  // ficou esperando a facial volta a rodar sozinho quando a foto é gravada, ou quando a
  // pessoa toca "Seguir sem facial" (OS-374, decisão do Gabriel em 04/11/2026, que
  // substitui a facial obrigatória de 31/10: sem facial, a entrada é pelo QR Code com
  // documento).
  const [facial, setFacial] = useState<'nao' | 'convite' | 'camera'>('nao');
  const aceiteEsperando = useRef<{ cpf: string; nome?: string; telefone?: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ticket-transfer-info', { body: { token } });
        if (error) throw error;
        if (data?.error) { setErro(data.error === 'link_invalido' ? 'Este link não existe. Confira com quem enviou.' : 'Não foi possível abrir o link.'); return; }
        setInfo(data as Info);
      } catch {
        setErro('Não foi possível abrir o link. Tente de novo em instantes.');
      } finally {
        setCarregando(false);
      }
    })();
  }, [token]);

  /**
   * Aceita o ingresso. O login já foi resolvido antes de chegar aqui — pelo
   * wizard (quem chega de fora) ou pela sessão que já existia.
   *
   * A conferência do CPF acontece no SERVIDOR: o que o wizard faz é evitar que
   * a pessoa preencha o resto à toa quando o convite não é dela.
   */
  const aceitar = async ({ cpf: cpfInformado, nome: nomeInformado, telefone: telInformado }: {
    cpf: string; nome?: string; telefone?: string;
  }) => {
    const cpfLimpo = (cpfInformado ?? '').replace(/\D/g, '');
    if (cpfLimpo.length !== 11) { toast.error('Informe seu CPF.'); return; }

    setProcessando(true);
    try {
      // Evento com entrada pela facial: sem facial cadastrada, primeiro o convite da
      // facial. O servidor confere de novo (a tela só conduz).
      if (info?.exigeFacial) {
        const { data: sessao } = await supabase.auth.getUser();
        const uid = sessao?.user?.id;
        const { data: perfil } = uid
          ? await supabase.from('profiles').select('cpf, facial_photo_path').eq('id', uid).maybeSingle()
          : { data: null };
        // Conta de outro CPF (o celular da família, logado em outra pessoa): a foto iria
        // parar no cadastro errado e a portaria ligaria este rosto a outro CPF. Para aqui,
        // antes da câmera. O servidor confere a mesma coisa.
        const cpfDaConta = String(perfil?.cpf ?? '').replace(/\D/g, '');
        if (cpfDaConta && cpfDaConta !== cpfLimpo) {
          toast.error('Esta conta está em outro CPF. Saia e crie a conta (ou entre) com o CPF de quem vai usar o ingresso.');
          return;
        }
        // Conta antiga sem CPF: a portaria liga o rosto ao ingresso pelo CPF do perfil, então
        // ele é gravado aqui, antes da câmera, e só se for o CPF para quem o ingresso foi
        // apontado (o final confere com o do link; o servidor confere o número inteiro).
        if (!cpfDaConta) {
          if (!cpfLimpo.endsWith(info.cpfFinal)) {
            toast.error(`Este ingresso é para o CPF terminado em ${info.cpfFinal}. Confira o CPF digitado.`);
            return;
          }
          const { data: def } = await supabase.rpc('definir_meu_cpf', { _cpf: cpfLimpo });
          if (!(def as { ok?: boolean } | null)?.ok) {
            toast.error('Não deu para gravar o CPF na sua conta. Fale com a organização do evento.');
            return;
          }
        }
        if (!perfil?.facial_photo_path && !seguiuSemFacial.current) {
          aceiteEsperando.current = { cpf: cpfLimpo, nome: nomeInformado, telefone: telInformado };
          registrarConviteFacial('mostrado', 'login');
          setFacial('convite');
          return;
        }
      }
      const { data, error } = await supabase.functions.invoke('ticket-transfer-accept', {
        body: { token, cpf: cpfLimpo, nome: nomeInformado || undefined, telefone: telInformado || undefined },
      });
      // O motivo vem no corpo; `invoke` lança sempre a mesma frase genérica.
      if (data?.error) { toast.error(data.error); return; }
      if (error) {
        const corpo = await (error as any)?.context?.json?.().catch(() => null);
        // Servidor antigo (antes do redeploy da OS-374) achou a conta sem facial: volta ao
        // convite, a não ser que a pessoa já tenha escolhido seguir sem ela.
        if (corpo?.code === 'sem_facial' && !seguiuSemFacial.current) {
          aceiteEsperando.current = { cpf: cpfLimpo, nome: nomeInformado, telefone: telInformado };
          setFacial('convite');
          return;
        }
        toast.error(corpo?.error || 'Não foi possível aceitar o ingresso.');
        return;
      }

      setPronto(true);
      setTimeout(() => navigate('/meus-ingressos'), 2200);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível aceitar o ingresso.');
    } finally {
      setProcessando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (erro || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="font-display font-semibold text-xl">Link indisponível</h1>
          <p className="text-sm text-muted-foreground">{erro ?? 'Não foi possível abrir este link.'}</p>
          <Button variant="outline" onClick={() => navigate('/')}>Ir para o início</Button>
        </div>
      </div>
    );
  }

  // Estados em que não há o que aceitar — cada um com o seu motivo, para a
  // pessoa saber o que fazer em vez de ficar tentando.
  if (info.status !== 'pendente') {
    const textos: Record<string, string> = {
      aceita: 'Este ingresso já foi aceito.',
      cancelada: `${info.deQuem} cancelou esta transferência.`,
      expirada: 'Este link venceu. Peça um novo para quem enviou.',
    };
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
          <h1 className="font-display font-semibold text-xl">Transferência encerrada</h1>
          <p className="text-sm text-muted-foreground">{textos[info.status] ?? 'Esta transferência não está mais ativa.'}</p>
          <Button variant="outline" onClick={() => navigate('/')}>Ir para o início</Button>
        </div>
      </div>
    );
  }

  const concluirFacial = () => {
    registrarConviteFacial('concluido', 'login');
    setFacial('nao');
    const pendente = aceiteEsperando.current;
    aceiteEsperando.current = null;
    if (pendente) void aceitar(pendente);
  };

  // "Seguir sem facial" (OS-374): conta como recusa, como sempre, e o aceite que esperava
  // a facial segue sem ela.
  const seguirSemFacial = () => {
    // Dois toques rápidos: o primeiro já levou o aceite que esperava; o segundo não faz nada.
    if (!aceiteEsperando.current) return;
    registrarConviteFacial('recusado', 'login');
    seguiuSemFacial.current = true;
    setFacial('nao');
    const pendente = aceiteEsperando.current;
    aceiteEsperando.current = null;
    if (pendente) void aceitar(pendente);
  };

  if (facial === 'camera') {
    return <FacialCaptureFullscreen onDone={concluirFacial} onSkip={() => setFacial('convite')} />;
  }

  if (facial === 'convite') {
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="max-w-md mx-auto space-y-5">
          <div className="text-center space-y-1">
            <ShieldCheck className="w-10 h-10 text-primary mx-auto" />
            <h1 className="font-display font-bold text-xl">Cadastre a sua facial</h1>
            <p className="text-sm text-muted-foreground">Com ela, a sua entrada é mais rápida. Prefere não fazer? Toque em "Seguir sem facial" e entre pelo QR Code com um documento oficial com foto.</p>
            {/* OS-374: o porquê da facial, na Política (seção 7). */}
            <p>
              <a
                href="/privacidade#eventos-com-facial"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-2"
              >
                Por que pedimos a facial?
              </a>
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
            <FacialInviteModal
              onActivate={() => setFacial('camera')}
              onSkip={seguirSemFacial}
              rotuloPular="Seguir sem facial"
            />
          </div>
        </div>
      </div>
    );
  }

  if (pronto) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-3 max-w-sm">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
          <h1 className="font-display font-bold text-2xl">Ingresso é seu!</h1>
          <p className="text-sm text-muted-foreground">
            Ele já está em <strong>Meus Ingressos</strong>. Levando você para lá…
          </p>
        </motion.div>
      </div>
    );
  }

  const ev = info.evento;

  return (
    <div className="min-h-screen">
      <Helmet><title>Ingresso transferido para você · FestPag</title></Helmet>

      <div className="max-w-md mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-1">
          <Ticket className="w-10 h-10 text-primary mx-auto mb-2" />
          <h1 className="font-display font-bold text-2xl">
            {info.deQuem} te enviou um ingresso
          </h1>
          <p className="text-sm text-muted-foreground">
            Confirme seus dados para o ingresso ficar na sua conta.
          </p>
        </div>

        {/* O que está sendo transferido — antes de pedir qualquer dado. */}
        {ev && (
          <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
            {ev.imagem && (
              <img src={ev.imagem} alt={ev.titulo} className="w-full h-32 object-cover" />
            )}
            <div className="p-4 space-y-2">
              <h2 className="font-display font-semibold text-lg leading-tight">{ev.titulo}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 shrink-0" />
                <span>{formatEventDate(ev.data, { day: '2-digit', month: 'long' })}{ev.hora ? ` · ${ev.hora.slice(0, 5)}` : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>{ev.local}{ev.cidade ? ` — ${ev.cidade}/${ev.estado}` : ''}</span>
              </div>
              {(info.ingresso.lote || info.ingresso.assento) && (
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/60">
                  {info.ingresso.assento ?? info.ingresso.lote}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Uma pergunta por vez. Quem abre este link não conhece a FestPag —
            chegou por um WhatsApp de um amigo — e um formulário com CPF, nome,
            e-mail, senha e telefone de uma vez é onde essa pessoa desiste. */}
        {user ? (
          /* Já logado nesta sessão: só confirma o CPF e aceita. */
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-3 flex gap-2.5">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Este ingresso foi reservado para o CPF terminado em <strong className="text-foreground">{info.cpfFinal}</strong>.
                Só ele consegue aceitar.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="a-cpf">Seu CPF</Label>
              <Input id="a-cpf" inputMode="numeric" placeholder="000.000.000-00"
                value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
            </div>
            <Button variant="hero" size="lg" className="w-full h-14 text-base font-semibold"
              onClick={() => aceitar({ cpf: cpf.replace(/\D/g, '') })} disabled={processando}>
              {processando
                ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Confirmando…</>
                : 'Aceitar ingresso'}
            </Button>
          </div>
        ) : (
          <AceiteDoIngresso
            cpfFinal={info.cpfFinal}
            jaTemConta={!!info.jaTemConta}
            emailMascarado={info.emailMascarado ?? null}
            processando={processando}
            onAceitar={aceitar}
            semFacial={!!info.exigeFacial}
          />
        )}

        <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
          Ao aceitar, o ingresso passa para a sua conta e o QR anterior deixa de valer.
          Este ingresso não pode ser repassado de novo.
        </p>
      </div>
    </div>
  );
}
