import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Loader2, Calendar, MapPin, ScanFace, Ticket, CheckCircle2, AlertCircle,
  UserRound, ShieldCheck, Mail, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCPF, validateCPF } from '@/utils/cpfValidator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { FluxoConta } from '@/components/auth/FluxoConta';
import FacialCaptureFullscreen from '@/components/auth/FacialCaptureFullscreen';
import FacialInviteModal from '@/components/auth/FacialInviteModal';
import { registrarConviteFacial } from '@/lib/conviteFacialLog';
import { formatEventDate } from '@/lib/eventTime';
import logoFestPag from '@/assets/brand/logo-gradiente.png';
import { toast } from 'sonner';

/*
 * Página do LINK DE CORTESIA de um evento (OS-313, nasceu para o Apresenta Summit 2026).
 *
 * O convidado chega por um link mandado pelo organizador e faz tudo numa tela só:
 * cria a conta, cadastra o rosto e sai com o ingresso. Decisão do Gabriel (26/10):
 * "um link dedicado a summit + festpag, a retirada do ingresso + cadastro + captura da
 * facial" e "o QR fica no final para baixar e enviar no e-mail da pessoa".
 *
 * Por que a ordem é esta: primeiro a pessoa vê de que evento se trata (quem chega de um
 * link não sabe), depois a conta, depois o rosto, e o ingresso por último. Pedir cadastro
 * antes de dizer do que se trata é o jeito mais rápido de fechar a aba.
 *
 * A facial é OBRIGATÓRIA: sem o rosto cadastrado não sai ingresso (decisão do Gabriel em
 * 26/10, mantida depois de eu levantar o parecer jurídico de 02/10, que desaconselha exigir
 * biometria como única porta). A trava real está na edge; esta tela só conduz.
 */

type Etapa = 'carregando' | 'convite' | 'conta' | 'facial' | 'facial-camera' | 'emitindo' | 'pronto' | 'erro';

interface EventoInfo {
  id: string;
  titulo: string;
  data: string;
  hora: string | null;
  local: string | null;
  cidade: string | null;
  estado: string | null;
  imagem: string | null;
}

interface IngressoEmitido {
  id: string;
  ticket_code: string;
  holder_name: string;
  status: string;
}

const MENSAGEM_ERRO: Record<string, string> = {
  sem_campanha: 'A retirada gratuita deste evento não está aberta agora. Fale com a organização do evento.',
  esgotado: 'Os ingressos gratuitos deste evento acabaram.',
  sem_cpf: 'Faltou o CPF na sua conta. Complete o seu perfil e volte a este link.',
  sem_email: 'Faltou o e-mail na sua conta. Complete o seu perfil e volte a este link.',
  sem_sessao: 'Sua sessão expirou. Entre de novo para retirar.',
  sem_facial: 'Para retirar este ingresso é preciso cadastrar a sua facial. É ela que libera a sua entrada no dia.',
  cpf_ja_retirou: 'Este CPF já retirou o ingresso grátis deste evento. Entre com a conta que retirou para ver o ingresso.',
  ja_retirou_agora: 'Seu ingresso já estava saindo em outra aba. Atualize a página para ver o ingresso.',
  retirada_incompleta: 'A sua retirada ficou pela metade. Tente de novo em alguns minutos.',
  erro_interno: 'Não deu para retirar agora. Tente de novo em instantes.',
  muitas_tentativas: 'Você tentou várias vezes seguidas. Espere uns 10 minutos e volte a este link.',
  // Acompanhante (OS-357)
  sem_acompanhante: 'Este evento libera um ingresso por pessoa. Peça para o seu acompanhante retirar o dele.',
  acompanhante_nome: 'Confira o nome do seu acompanhante.',
  acompanhante_cpf: 'O CPF do acompanhante não é válido. Confira os números.',
  acompanhante_mesmo_cpf: 'O CPF do acompanhante é o seu. Informe o CPF da outra pessoa.',
  acompanhante_email: 'Confira o e-mail do seu acompanhante.',
  acompanhante_ja_tem: 'O seu acompanhante já tem ingresso deste evento. Retire só o seu.',
  so_resta_um: 'Só sobrou um ingresso gratuito. Dá para retirar o seu: escolha "Só eu".',
  ja_e_acompanhante: 'Alguém já retirou um ingresso no seu CPF para este evento. Procure o e-mail com o link para pegar o seu.',
};
/** Erro em que mandar a pessoa ao perfil resolve. */
const LEVA_AO_PERFIL = new Set(['sem_cpf', 'sem_email']);

export default function CortesiaLink() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>('carregando');
  const [evento, setEvento] = useState<EventoInfo | null>(null);
  const [esgotado, setEsgotado] = useState(false);
  // Acompanhante (OS-357): só aparece no lote que libera 2 por CPF.
  const [maxPorCpf, setMaxPorCpf] = useState(1);
  const [comAcompanhante, setComAcompanhante] = useState(false);
  const [aNome, setANome] = useState('');
  const [aCpf, setACpf] = useState('');
  const [aEmail, setAEmail] = useState('');
  // O que vai na retirada. Ref porque a retirada é chamada de vários pontos (depois da
  // conta, depois da facial) e precisa do valor confirmado no convite.
  const acompanhanteRef = useRef<{ nome: string; cpf: string; email: string } | null>(null);
  const [acompanhanteEnviado, setAcompanhanteEnviado] = useState<{ email: string; enviado: boolean } | null>(null);
  const [acompanhanteFora, setAcompanhanteFora] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [codigoErro, setCodigoErro] = useState<string | null>(null);
  const [ingressos, setIngressos] = useState<IngressoEmitido[]>([]);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [jaTinha, setJaTinha] = useState(false);
  // `null` enquanto a resposta não chegou: tratar "não sei" como "não tem" mandava quem
  // já tinha rosto cadastrado para a câmera de novo (recoleta de biometria à toa).
  const [temFacial, setTemFacial] = useState<boolean | null>(null);
  const [avisoFacial, setAvisoFacial] = useState(false);

  const chamar = useCallback(async (acao: 'info' | 'retirar') => {
    const { data, error } = await supabase.functions.invoke('cortesia-link', {
      body: { acao, slug, ...(acao === 'retirar' && acompanhanteRef.current ? { acompanhante: acompanhanteRef.current } : {}) },
    });
    // O `invoke` lança em resposta não 2xx e guarda a resposta em error.context. O único
    // caso que chega assim é o limite de tentativas (429); os outros voltam 200 com `code`.
    if (error) {
      const status = (error as { context?: { status?: number } })?.context?.status;
      if (status === 429) return { ok: false, code: 'muitas_tentativas' } as const;
      throw error;
    }
    return data as {
      ok: boolean; code?: string; evento?: EventoInfo; esgotado?: boolean; max_por_cpf?: number;
      ingressos?: IngressoEmitido[]; email_enviado?: boolean; repetido?: boolean;
      acompanhante?: { email: string; enviado: boolean } | null;
      acompanhante_nao_incluido?: boolean;
    };
  }, [slug]);

  // 1) O que é este link
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await chamar('info');
        if (!vivo) return;
        if (!r.ok || !r.evento) {
          setCodigoErro(r.code ?? 'erro_interno');
          setErro(MENSAGEM_ERRO[r.code ?? 'erro_interno'] ?? MENSAGEM_ERRO.erro_interno);
          setEtapa('erro');
          return;
        }
        setEvento(r.evento);
        setEsgotado(Boolean(r.esgotado));
        setMaxPorCpf(Number(r.max_por_cpf ?? 1));
        setEtapa('convite');
      } catch {
        if (!vivo) return;
        setCodigoErro('erro_interno');
        setErro(MENSAGEM_ERRO.erro_interno);
        setEtapa('erro');
      }
    })();
    return () => { vivo = false; };
  }, [chamar]);

  // 2) Quem já está logado pode ter rosto cadastrado — isso decide se a etapa da facial aparece.
  useEffect(() => {
    if (!user) { setTemFacial(false); return; }
    setTemFacial(null);
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('facial_photo_path')
        .eq('id', user.id)
        .maybeSingle();
      if (vivo) setTemFacial(Boolean(data?.facial_photo_path));
    })();
    return () => { vivo = false; };
  }, [user]);

  const retirar = useCallback(async () => {
    setEtapa('emitindo');
    try {
      const r = await chamar('retirar');
      if (!r.ok) {
        // A edge é quem manda na facial: se faltou rosto, a tela leva para a captura.
        if (r.code === 'sem_facial') { setTemFacial(false); setEtapa('facial'); return; }
        setCodigoErro(r.code ?? 'erro_interno');
        setErro(MENSAGEM_ERRO[r.code ?? 'erro_interno'] ?? MENSAGEM_ERRO.erro_interno);
        setEtapa('erro');
        return;
      }
      setIngressos(r.ingressos ?? []);
      setEmailEnviado(Boolean(r.email_enviado));
      setJaTinha(Boolean(r.repetido));
      setAcompanhanteEnviado(r.acompanhante ?? null);
      setAcompanhanteFora(Boolean(r.acompanhante_nao_incluido));
      setEtapa('pronto');
    } catch {
      setCodigoErro('erro_interno');
      setErro(MENSAGEM_ERRO.erro_interno);
      setEtapa('erro');
    }
  }, [chamar]);

  // Conta pronta: se já tem rosto, emite direto; senão, convida para a facial.
  const depoisDaConta = useCallback(async () => {
    const { data: sessao } = await supabase.auth.getUser();
    const uid = sessao?.user?.id;
    let comFacial = false;
    if (uid) {
      const { data } = await supabase
        .from('profiles')
        .select('facial_photo_path')
        .eq('id', uid)
        .maybeSingle();
      comFacial = Boolean(data?.facial_photo_path);
    }
    setTemFacial(comFacial);
    // A facial é obrigatória neste link: quem recusou o convite do cadastro passa por ela
    // aqui, porque sem rosto a edge não emite ingresso nenhum.
    if (comFacial) { void retirar(); return; }
    setEtapa('facial');
  }, [retirar]);

  // O termômetro do convite da facial (nasceu em 28/09 porque o convite sumiu do site por
  // 25 dias sem ninguém notar): "mostrado" quando a tela aparece, "concluído" só depois da
  // foto gravada, "recusado" no pular. A origem é 'login' porque é a que o FluxoConta usa
  // quando está embutido numa página como esta: assim o número do evento sai inteiro.
  const conviteContado = useRef(false);
  useEffect(() => {
    if (etapa === 'facial' && !conviteContado.current) {
      conviteContado.current = true;
      registrarConviteFacial('mostrado', 'login');
    }
  }, [etapa]);

  const comecar = () => {
    // Confere o acompanhante aqui, antes da conta e da facial: errar o CPF dele só depois
    // de tudo isso faria a pessoa voltar ao começo.
    if (comAcompanhante) {
      const nome = aNome.trim().replace(/\s+/g, ' ');
      const cpfA = aCpf.replace(/\D/g, '');
      const email = aEmail.trim().toLowerCase();
      if (nome.length < 3) { toast.error(MENSAGEM_ERRO.acompanhante_nome); return; }
      if (!validateCPF(cpfA)) { toast.error(MENSAGEM_ERRO.acompanhante_cpf); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error(MENSAGEM_ERRO.acompanhante_email); return; }
      acompanhanteRef.current = { nome, cpf: cpfA, email };
    } else {
      acompanhanteRef.current = null;
    }
    if (!user) { setEtapa('conta'); return; }
    if (temFacial === null) { void retirar(); return; }  // ainda não sei: a edge decide
    if (!temFacial) { setEtapa('facial'); return; }
    void retirar();
  };

  const dataLonga = evento
    ? `${formatEventDate(evento.data, { day: '2-digit', month: 'long' })}${evento.hora ? ` · ${evento.hora.slice(0, 5)}` : ''}`
    : '';
  const lugar = evento
    ? [evento.local, [evento.cidade, evento.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{evento ? `Ingresso grátis · ${evento.titulo}` : 'Ingresso grátis'} | FestPag</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* Capa do evento: é o que diz à pessoa de onde veio o convite. */}
      <div className="relative h-44 sm:h-60 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-background">
        {evento?.imagem && (
          <img src={evento.imagem} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/65 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 px-5 pb-4 max-w-xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Ingresso grátis</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight mt-1">
            {evento?.titulo ?? 'Carregando…'}
          </h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-5 pb-16 pt-4">
        {evento && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-6">
            <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4" />{dataLonga}</span>
            {lugar && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{lugar}</span>}
          </div>
        )}

        <AnimatePresence mode="wait">
          {etapa === 'carregando' && (
            <motion.div key="l" className="py-16 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            </motion.div>
          )}

          {etapa === 'erro' && (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center space-y-4">
              <AlertCircle className="h-7 w-7 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">{erro}</p>
              <div className="space-y-2">
                <Button variant="outline" size="lg" className="w-full"
                  onClick={() => { setErro(null); setEtapa('convite'); }}>
                  Tentar de novo
                </Button>
                {codigoErro && LEVA_AO_PERFIL.has(codigoErro) && (
                  <Button variant="ghost" size="lg" className="w-full" onClick={() => navigate('/minha-conta')}>
                    Completar meu perfil
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {etapa === 'convite' && (
            <motion.div key="c" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
                <p className="text-sm leading-relaxed">
                  Seu ingresso é gratuito. São três passos rápidos, e no fim ele fica aqui, na sua
                  conta, e também vai por e-mail se você tiver um cadastrado.
                </p>
                <ol className="space-y-3">
                  {[
                    { n: 1, icone: UserRound, t: 'Sua conta', d: 'CPF, contato e uma senha.' },
                    { n: 2, icone: ScanFace, t: 'Sua facial', d: 'É ela que abre a entrada no dia, sem fila.' },
                    { n: 3, icone: Ticket, t: 'Seu ingresso', d: 'Com o QR para guardar no celular.' },
                  ].map(({ n, icone: Icone, t, d }) => (
                    <li key={n} className="flex gap-3">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
                        <Icone className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-snug">{t}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{d}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {!esgotado && maxPorCpf >= 2 && (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-sm">Vai levar alguém?</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ v: false, t: 'Só eu' }, { v: true, t: 'Eu e um acompanhante' }].map(({ v, t }) => (
                      <button key={t} type="button" aria-pressed={comAcompanhante === v} onClick={() => setComAcompanhante(v)}
                        className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${comAcompanhante === v ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'border-border bg-background text-foreground'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {comAcompanhante && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        O ingresso dele sai no CPF dele. Ele recebe um e-mail para criar a conta e
                        cadastrar a facial, que é o que libera a entrada dele no dia.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-nome">Nome do acompanhante</Label>
                        <Input id="a-nome" autoComplete="off" placeholder="Como está no documento"
                          value={aNome} onChange={(e) => setANome(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-cpf">CPF do acompanhante</Label>
                        <Input id="a-cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"
                          value={aCpf} onChange={(e) => setACpf(formatCPF(e.target.value))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-email">E-mail do acompanhante</Label>
                        <Input id="a-email" type="email" inputMode="email" autoComplete="off" placeholder="email@exemplo.com"
                          value={aEmail} onChange={(e) => setAEmail(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {esgotado ? (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-5 text-center space-y-2">
                  <AlertCircle className="h-6 w-6 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Os ingressos gratuitos deste evento acabaram.
                  </p>
                </div>
              ) : (
                <Button variant="hero" size="lg" className="w-full h-13" onClick={comecar}>
                  Retirar meu ingresso
                </Button>
              )}
            </motion.div>
          )}

          {etapa === 'conta' && (
            <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden">
              <FluxoConta embutido semFacial abaInicial="cadastro" onFechar={() => setEtapa('convite')} onAuthenticated={depoisDaConta} />
            </motion.div>
          )}

          {etapa === 'facial' && (
            <motion.div key="f" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* O convite é o MESMO do resto do site: biometria é dado sensível e o
                  consentimento tem que ser específico e prévio (LGPD art. 11). Sem o
                  checkbox marcado, a câmera nem abre. */}
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
                <FacialInviteModal
                  onActivate={() => setEtapa('facial-camera')}
                  onSkip={() => { registrarConviteFacial('recusado', 'login'); setAvisoFacial(true); }}
                />
              </div>
              <div className="space-y-2 text-center">
                <p className="text-xs text-muted-foreground">
                  {avisoFacial
                    ? 'Este ingresso só é liberado com a facial cadastrada: é ela que abre a entrada no dia.'
                    : 'A facial é o que libera a sua entrada no dia deste evento.'}
                </p>
                {/* Com a facial obrigatória, quem está com a câmera bloqueada ou num celular
                    emprestado ficaria sem ingresso e sem a quem recorrer. */}
                {avisoFacial && (
                  <p className="text-xs text-muted-foreground">
                    A câmera não abriu? Tente pelo navegador do seu celular, liberando o acesso à
                    câmera quando ele pedir. Se não der, fale com a organização do evento.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {etapa === 'facial-camera' && (
            <FacialCaptureFullscreen
              onDone={() => { registrarConviteFacial('concluido', 'login'); setTemFacial(true); void retirar(); }}
              onSkip={() => setEtapa('facial')}
            />
          )}

          {etapa === 'emitindo' && (
            <motion.div key="em" className="py-16 text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Separando o seu ingresso…</p>
            </motion.div>
          )}

          {etapa === 'pronto' && (
            <motion.div key="p" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
                <h2 className="font-display text-xl font-bold">
                  {jaTinha ? 'Você já tinha retirado' : 'Ingresso garantido!'}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  No dia é só chegar e olhar para a câmera. O QR abaixo serve de reserva.
                </p>
                {emailEnviado && (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 justify-center">
                    <Mail className="h-3.5 w-3.5" /> Também mandamos para o seu e-mail.
                  </p>
                )}
              </div>

              {acompanhanteFora && (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-5 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    A sua retirada já tinha sido feita só para você. O seu acompanhante pode retirar o
                    dele aqui mesmo, com a conta e o CPF dele.
                  </p>
                </div>
              )}

              {acompanhanteEnviado && (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-5 flex gap-3">
                  <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {acompanhanteEnviado.enviado
                      ? <>O ingresso do seu acompanhante foi para <strong>{acompanhanteEnviado.email}</strong>. Ele cria a conta e cadastra a facial pelo link do e-mail.</>
                      : <>O ingresso do seu acompanhante já está no CPF dele, mas o e-mail não saiu agora. Fale com a organização do evento para reenviar o link.</>}
                  </p>
                </div>
              )}

              {ingressos.map((t) => (
                <div key={t.id} className="rounded-2xl border border-border/60 bg-card p-6 text-center space-y-3">
                  <div className="bg-white p-4 rounded-xl inline-block">
                    <QRCodeSVG value={t.ticket_code} size={192} level="M" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t.holder_name}</p>
                    <p className="text-xs text-muted-foreground font-mono tracking-wider mt-0.5">{t.ticket_code}</p>
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-border/60 bg-card/40 p-4 flex gap-3">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O ingresso também fica guardado em <strong>Meus Ingressos</strong>, na sua conta. Se
                  perder este link, é só entrar no site com o seu e-mail.
                </p>
              </div>


            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-center gap-2.5 opacity-70">
          <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Tecnologia</span>
          <img src={logoFestPag} alt="FestPag" className="h-5 w-auto" />
        </div>
      </div>
    </div>
  );
}
