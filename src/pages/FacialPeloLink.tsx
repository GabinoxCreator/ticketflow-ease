/*
 * /facial/:token: a tela que o CELULAR abre ao ler o QR Code do computador (ou
 * ao tocar no link que chegou pelo WhatsApp). OS-343, refeita a partir do
 * `b3bea40` (28/09/2026, nunca publicado).
 *
 * O token vale 15 minutos e um uso só; quem valida é a edge `facial-link`, que
 * devolve uma sessão da conta. Aqui não há senha, CPF nem nada para digitar: a
 * pessoa abre e tira a foto. No computador, a tela segue sozinha quando o rosto
 * chega no perfil.
 *
 * Só existe código para abrir com a chave da facial obrigatória ligada; com ela
 * desligada esta rota fica no site, mas ninguém gera link para ela.
 *
 * ⚠️ A SESSÃO DESTA PÁGINA É SÓ DELA (OS-343, revisões 1 e 2). A página usa um
 * cliente do Supabase próprio, só em memória (`persistSession: false`, chave de
 * armazenamento própria), e é ele que manda a foto. Ela NUNCA toca na sessão que o
 * navegador já tenha: o link pode ser aberto pelo WhatsApp Web no mesmo computador
 * da compra, ou num celular emprestado já logado em outra conta, e nos dois casos
 * a conta que estava aberta continua aberta e intacta. A sessão do link some ao
 * fechar a página em QUALQUER estado (inclusive com a câmera aberta ou com o envio
 * da foto falhando): um pedido `keepalive` de saída derruba a sessão no servidor.
 * Depois da foto ela também sai em 1 minuto ou quando a pessoa troca de app, a não
 * ser que toque em "Ou continuar aqui pelo celular" (aí, se o navegador não tinha
 * conta aberta, a sessão passa para o site; se tinha, a de lá fica e esta sai).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Loader2, CheckCircle2, AlertCircle, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import FacialCaptureFullscreen from '@/components/auth/FacialCaptureFullscreen';

type Estado = 'abrindo' | 'camera' | 'pronto' | 'sem-camera' | 'erro';
type Sessao = { access_token: string; refresh_token: string };

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL as string;
const CHAVE_PUBLICA = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Cliente só desta página: memória, sem renovar sozinho, sem ler a URL. */
function novoClienteDoLink(): SupabaseClient {
  return createClient(URL_SUPABASE, CHAVE_PUBLICA, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'festpag-facial-link',
    },
  });
}

const RECADO: Record<string, string> = {
  nao_encontrado: 'Esse código não existe mais. Gere um novo na tela do computador.',
  ja_usado: 'Esse código já foi usado. Gere um novo na tela do computador.',
  expirado: 'Esse código venceu: ele vale 15 minutos. Gere um novo na tela do computador.',
  token_invalido: 'Esse endereço não está completo. Leia o código de novo na tela do computador.',
};
const RECADO_PADRAO = 'Não consegui abrir esse código. Gere um novo na tela do computador.';

export default function FacialPeloLink() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>('abrindo');
  const [recado, setRecado] = useState<string>('');
  const [cliente] = useState(novoClienteDoLink);
  const jaAbriu = useRef(false);
  const sessao = useRef<Sessao | null>(null);
  const ficouNoCelular = useRef(false);
  const jaSaiu = useRef(false);

  /* Derruba a sessão do link no servidor. `keepalive` sai mesmo com a página fechando. */
  const encerrarSessao = useCallback(() => {
    if (ficouNoCelular.current || jaSaiu.current || !sessao.current) return;
    jaSaiu.current = true;
    const acesso = sessao.current.access_token;
    sessao.current = null;
    try {
      void fetch(`${URL_SUPABASE}/auth/v1/logout?scope=local`, {
        method: 'POST',
        keepalive: true,
        headers: { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${acesso}` },
      });
    } catch { /* a sessão só vivia na memória desta página: some junto com ela */ }
  }, []);

  /* Fechar a página (ou sair dela pelo site), em qualquer estado. */
  useEffect(() => {
    window.addEventListener('pagehide', encerrarSessao);
    return () => {
      window.removeEventListener('pagehide', encerrarSessao);
      encerrarSessao();
    };
  }, [encerrarSessao]);

  /* Depois da foto (ou sem câmera): 1 minuto, ou trocar de app. */
  useEffect(() => {
    if (estado !== 'pronto' && estado !== 'sem-camera') return;
    const relogio = setTimeout(encerrarSessao, 60_000);
    const aoEsconder = () => { if (document.visibilityState === 'hidden') encerrarSessao(); };
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      clearTimeout(relogio);
      document.removeEventListener('visibilitychange', aoEsconder);
    };
  }, [estado, encerrarSessao]);

  useEffect(() => {
    /* O código é de uso único: abrir duas vezes o queimaria à toa. */
    if (jaAbriu.current) return;
    jaAbriu.current = true;

    (async () => {
      try {
        const { data, error } = await cliente.functions.invoke('facial-link', {
          body: { acao: 'abrir', token },
        });
        let codigo: string | undefined = data?.erro;
        if (error && !codigo) {
          /* Em resposta != 2xx o corpo vem em error.context. */
          try { codigo = (await (error as { context?: Response }).context?.json())?.erro; } catch { /* segue */ }
        }
        if (error || !data?.ok || !data?.sessao?.access_token) {
          setRecado(RECADO[codigo ?? ''] ?? RECADO_PADRAO);
          setEstado('erro');
          return;
        }
        sessao.current = { access_token: data.sessao.access_token, refresh_token: data.sessao.refresh_token };
        const { error: erroSessao } = await cliente.auth.setSession(sessao.current);
        if (erroSessao) throw erroSessao;
        setEstado('camera');
      } catch {
        encerrarSessao();
        setRecado(RECADO_PADRAO);
        setEstado('erro');
      }
    })();
  }, [token, cliente, encerrarSessao]);

  /* "Continuar aqui": só leva a sessão para o site se o navegador não tinha conta aberta. */
  const continuarAqui = async (e: React.MouseEvent) => {
    e.preventDefault();
    const { data } = await supabase.auth.getSession();
    if (!data.session && sessao.current) {
      ficouNoCelular.current = true;
      await supabase.auth.setSession(sessao.current).catch(() => undefined);
    } else {
      encerrarSessao();
    }
    navigate('/');
  };

  if (estado === 'camera') {
    return (
      <FacialCaptureFullscreen
        obrigatoria
        cliente={cliente}
        onDone={() => setEstado('pronto')}
        /* Aqui não há convite para voltar: esta página é só a foto. */
        onSkip={() => setEstado('sem-camera')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <Helmet><title>Cadastro do rosto · FestPag</title></Helmet>

      <div className="w-full max-w-sm text-center space-y-6">
        {estado === 'abrindo' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <div className="space-y-2">
              <h1 className="font-display text-xl font-bold tracking-tight">Abrindo...</h1>
              <p className="text-sm text-muted-foreground">Só um instante.</p>
            </div>
          </>
        )}

        {estado === 'pronto' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-xl font-bold tracking-tight">Pronto!</h1>
              <p className="text-sm text-muted-foreground">
                Seu rosto foi cadastrado. Pode voltar para a tela do computador: ela já seguiu sozinha.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card/50 p-4 text-sm text-muted-foreground">
              <Monitor className="h-4 w-4 flex-shrink-0" />
              Terminando a compra por lá
            </div>
            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link to="/" onClick={continuarAqui}>Ou continuar aqui pelo celular</Link>
            </Button>
          </>
        )}

        {estado === 'sem-camera' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-xl font-bold tracking-tight">A foto não foi tirada</h1>
              <p className="text-sm text-muted-foreground">
                Volte para a tela do computador: lá dá para gerar outro código ou seguir sem a foto.
              </p>
            </div>
          </>
        )}

        {estado === 'erro' && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-xl font-bold tracking-tight">Código indisponível</h1>
              <p className="text-sm text-muted-foreground">{recado}</p>
            </div>
            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link to="/">Ir para a FestPag</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
