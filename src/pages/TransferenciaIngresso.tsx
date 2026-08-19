import { useEffect, useState } from 'react';
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
  evento: { titulo: string; data: string; hora: string; local: string; cidade: string; estado: string; imagem: string | null } | null;
  ingresso: { lote: string | null; assento: string | null };
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

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [processando, setProcessando] = useState(false);
  const [pronto, setPronto] = useState(false);

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

  const aceitar = async () => {
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) { toast.error('Informe seu CPF.'); return; }

    setProcessando(true);
    try {
      // Sem conta ainda: cria agora. A confirmação de e-mail está desligada no
      // projeto, então o cadastro já entra logado e o aceite segue na sequência.
      if (!user) {
        if (!nome.trim() || !email.trim() || senha.length < 6) {
          toast.error('Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.');
          setProcessando(false);
          return;
        }
        const { error: signErr } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome_completo: nome.trim() } },
        });
        if (signErr) {
          // Já tem conta com esse e-mail: tenta entrar com a senha informada.
          const { error: loginErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
          if (loginErr) {
            toast.error('Já existe uma conta com esse e-mail. Entre com a sua senha para aceitar.');
            setProcessando(false);
            return;
          }
        }
      }

      const { data, error } = await supabase.functions.invoke('ticket-transfer-accept', {
        body: { token, cpf: cpfLimpo, nome: nome.trim() || undefined, telefone: telefone.replace(/\D/g, '') || undefined },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); setProcessando(false); return; }

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
      expirada: 'Este link venceu (ele vale 24 horas). Peça um novo para quem enviou.',
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
    <div className="min-h-screen bg-background">
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

        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-3 flex gap-2.5">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Este ingresso foi reservado para o CPF terminado em <strong className="text-foreground">{info.cpfFinal}</strong>.
            Só ele consegue aceitar.
          </p>
        </div>

        <div className="space-y-4">
          {!user && (
            <>
              <div className="space-y-2">
                <Label htmlFor="a-nome">Seu nome completo</Label>
                <Input id="a-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como no documento" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-email">Seu e-mail</Label>
                <Input id="a-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a-senha">Crie uma senha</Label>
                <Input id="a-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <p className="text-[11px] text-muted-foreground">
                  É com ela que você acessa seus ingressos no dia do evento.
                </p>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="a-cpf">Seu CPF</Label>
            <Input id="a-cpf" inputMode="numeric" placeholder="000.000.000-00"
              value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
          </div>

          {!user && (
            <div className="space-y-2">
              <Label htmlFor="a-tel">WhatsApp <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Input id="a-tel" inputMode="numeric" placeholder="(17) 99999-9999"
                value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
          )}

          <Button variant="hero" size="lg" className="w-full h-14 text-base font-semibold"
            onClick={aceitar} disabled={processando}>
            {processando
              ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Confirmando…</>
              : 'Aceitar ingresso'}
          </Button>

          <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
            Ao aceitar, o ingresso passa para a sua conta e o QR anterior deixa de valer.
            Este ingresso não pode ser repassado de novo.
          </p>
        </div>
      </div>
    </div>
  );
}
