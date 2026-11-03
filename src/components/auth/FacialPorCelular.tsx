/*
 * "Não tenho câmera neste aparelho": o rosto é tirado no celular (OS-343).
 *
 * Refeito em 29/10/2026 a partir do `b3bea40` (28/09, nunca publicado), que só
 * mandava o link pelo WhatsApp. O WhatsApp da casa ficou fora de 10/10 em diante,
 * e com a facial obrigatória uma saída que depende só dele trava o cadastro e a
 * venda. Por isso o caminho PRINCIPAL agora é um QR Code na própria tela: a
 * pessoa aponta o celular, tira a foto lá, e esta tela segue sozinha. O link no
 * WhatsApp ficou como segunda opção.
 *
 * O código vale 15 minutos e serve uma vez (quem garante é a edge `facial-link`).
 * Venceu: a tela oferece outro. Pedir outro (ou mandar pelo WhatsApp) mata o
 * anterior: um código vivo por conta, sempre.
 *
 * Como a tela sabe que a foto chegou: pergunta ao banco de 4 em 4 segundos se o
 * perfil já tem rosto. É uma espera curta, com uma pessoa olhando para a tela.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, MessageCircle, Smartphone, CheckCircle2, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { marcarCadastroEmCurso } from '@/lib/cadastroEmCurso';

interface Props {
  /** A foto chegou pelo celular. */
  onPronto: () => void;
  /** Voltar ao convite (achou uma câmera aqui). */
  onVoltar: () => void;
  /** Não tem celular com câmera: segue sem a foto, com o aviso. */
  onNaoConsigo: () => void;
}

const INTERVALO_MS = 4000;

type Estado = 'gerando' | 'qr' | 'whatsapp' | 'falhou' | 'chegou';

export default function FacialPorCelular({ onPronto, onVoltar, onNaoConsigo }: Props) {
  const { user } = useAuth();
  const [estado, setEstado] = useState<Estado>('gerando');
  const [url, setUrl] = useState<string | null>(null);
  const [expiraEm, setExpiraEm] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [destino, setDestino] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);
  const vivo = useRef(true);
  /* Só a resposta do ÚLTIMO pedido vale: pedir outro código mata o anterior na
   * edge, e uma resposta atrasada não pode pôr na tela um código já morto. */
  const ultimoPedido = useRef(0);

  /* `true` de novo a cada montagem: o React em modo de desenvolvimento monta,
   * desmonta e monta outra vez, e sem isto a tela ficava presa em "gerando". */
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const gerar = useCallback(async () => {
    const meu = ++ultimoPedido.current;
    setEstado('gerando');
    setUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('facial-link', { body: { acao: 'gerar' } });
      if (!vivo.current || meu !== ultimoPedido.current) return;
      if (data?.ok && data?.jaTem) { setEstado('chegou'); return; }
      if (error || !data?.ok || !data?.url) throw new Error(data?.erro ?? 'falha');
      setUrl(String(data.url));
      setExpiraEm(new Date(String(data.expiraEm)).getTime());
      setAgora(Date.now());
      setEstado('qr');
    } catch {
      if (vivo.current && meu === ultimoPedido.current) setEstado('falhou');
    }
  }, []);

  useEffect(() => { void gerar(); }, [gerar]);

  /* Relógio do código: só para dizer "venceu" e oferecer outro. */
  useEffect(() => {
    if (estado !== 'qr' && estado !== 'whatsapp') return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [estado]);

  /* Enquanto houver código de pé, olha o perfil de tempos em tempos. */
  useEffect(() => {
    if (!user?.id || (estado !== 'qr' && estado !== 'whatsapp')) return;
    const id = setInterval(async () => {
      /* A trava "cadastro em curso" vale 10 min e o código, 15: enquanto a tela
       * espera a foto, a trava é renovada, para um remonte não mandar a pessoa embora. */
      marcarCadastroEmCurso();
      const { data } = await supabase
        .from('profiles')
        .select('facial_photo_path')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.facial_photo_path && vivo.current) {
        clearInterval(id);
        setEstado('chegou');
      }
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [estado, user?.id]);

  useEffect(() => {
    if (estado !== 'chegou') return;
    const t = setTimeout(() => { if (vivo.current) onPronto(); }, 1600);
    return () => clearTimeout(t);
  }, [estado, onPronto]);

  const mandarNoWhatsapp = async () => {
    setMandando(true);
    setRecado(null);
    /* Mandar pelo WhatsApp também mata o código da tela: invalida a resposta pendente. */
    ++ultimoPedido.current;
    try {
      const { data, error } = await supabase.functions.invoke('facial-link', { body: { acao: 'enviar' } });
      if (!vivo.current) return;
      if (data?.ok && data?.jaTem) { setEstado('chegou'); return; }
      if (error || !data?.ok) {
        /* Resposta != 2xx: o supabase-js guarda o corpo em error.context. */
        let codigo: string | undefined = data?.erro;
        if (!codigo && error) {
          try { codigo = (await (error as { context?: Response }).context?.json())?.erro; } catch { /* segue */ }
        }
        const semNumero = codigo === 'sem_whatsapp';
        setRecado(semNumero
          ? 'A sua conta não tem celular cadastrado. Use o código da tela.'
          : 'Não consegui mandar pelo WhatsApp agora. Use o código da tela.');
        /* Pedir pelo WhatsApp pode ter matado o código da tela: gera outro. */
        await gerar();
        return;
      }
      setDestino(data.destinoMascarado ?? null);
      setExpiraEm(Date.now() + 15 * 60_000);
      setAgora(Date.now());
      setEstado('whatsapp');
    } catch {
      if (vivo.current) {
        setRecado('Não consegui mandar pelo WhatsApp agora. Use o código da tela.');
        await gerar();
      }
    } finally {
      if (vivo.current) setMandando(false);
    }
  };

  const venceu = expiraEm !== null && agora >= expiraEm;
  const minutos = expiraEm ? Math.max(0, Math.ceil((expiraEm - agora) / 60_000)) : 15;

  if (estado === 'chegou') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl font-bold tracking-tight">Rosto cadastrado!</h3>
          <p className="text-sm text-muted-foreground">Seguindo daqui mesmo, pode deixar.</p>
        </div>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-pink-500 text-primary-foreground">
          <Smartphone className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl font-bold tracking-tight">
            {estado === 'whatsapp' ? 'Olhe o seu WhatsApp' : 'Termine pelo celular'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {estado === 'whatsapp'
              ? 'Abra o link que mandamos, tire a foto por lá e volte para esta tela. Ela segue sozinha.'
              : 'Aponte a câmera do celular para o código abaixo. Você tira a foto por lá e esta tela segue sozinha.'}
          </p>
        </div>
      </div>

      {estado === 'gerando' && (
        <div className="flex h-[232px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {estado === 'falhou' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">Não consegui gerar o código agora.</p>
          <Button type="button" variant="hero" size="lg" className="w-full gap-2" onClick={() => void gerar()}>
            <RefreshCw className="h-4 w-4" /> Tentar de novo
          </Button>
        </div>
      )}

      {estado === 'qr' && url && (
        <div className="space-y-3">
          <div className={`mx-auto w-fit rounded-2xl bg-white p-4 ${venceu ? 'opacity-25' : ''}`} data-testid="qr-facial">
            <QRCodeSVG value={url} size={200} level="M" />
          </div>
          {venceu ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">O código venceu.</p>
              <Button type="button" variant="hero" size="lg" className="w-full gap-2" onClick={() => void gerar()}>
                <RefreshCw className="h-4 w-4" /> Gerar outro código
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Esperando a foto chegar · vale por mais {minutos} min e serve uma vez
            </div>
          )}
        </div>
      )}

      {estado === 'whatsapp' && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3 rounded-xl border border-border bg-card/50 p-4">
            <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {venceu ? 'O link venceu.' : 'Esperando a foto chegar'}
              {destino && !venceu ? <>. Mandamos para <span className="font-semibold text-foreground">{destino}</span></> : null}
            </p>
          </div>
          <Button type="button" variant="ghost" size="lg" className="w-full gap-2" onClick={() => void gerar()}>
            <RefreshCw className="h-4 w-4" /> Mostrar o código na tela
          </Button>
        </div>
      )}

      {recado && <p className="text-center text-sm text-amber-500">{recado}</p>}

      <div className="space-y-2">
        {/* Também quando o QR não pôde ser gerado: o WhatsApp é a outra porta. */}
        {(estado === 'qr' || estado === 'falhou') && (
          <Button type="button" variant="ghost" size="lg" className="w-full gap-2"
            onClick={mandarNoWhatsapp} disabled={mandando}>
            {mandando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            Prefiro receber o link no WhatsApp
          </Button>
        )}
        <Button type="button" variant="ghost" size="lg" className="w-full gap-2 text-muted-foreground" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <button type="button" onClick={onNaoConsigo}
          className="block w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Não tenho celular com câmera
        </button>
      </div>
    </motion.div>
  );
}
