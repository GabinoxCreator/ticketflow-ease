/*
 * "Como falamos com você" — a seção de canais da Minha Conta (Bloco 2, plano 09/09/2026).
 *
 * Mostra o WhatsApp e o e-mail da conta com o estado de cada um (confirmado por
 * código ou não), deixa confirmar, adicionar e trocar — sempre com código —,
 * escolher onde receber os ingressos, e trocar a senha com código (é o único
 * caminho de quem não tem e-mail). Tudo passa pela edge `auth-canal`.
 */
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MessageCircle, Mail, Check, Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import {
  canalPedir, canalConfirmar, canalPreferencia, ehEmailInterno, mensagemDoErro,
  type Canal, type CanalPreferido, type RespostaEnvio,
} from '@/lib/authV2';

type PerfilV2 = {
  whatsapp?: string | null;
  email?: string | null;
  whatsapp_confirmado_em?: string | null;
  email_confirmado_em?: string | null;
  canal_preferido?: CanalPreferido | null;
};

const formatarTelefone = (raw: string) => {
  const d = raw.replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
};

type Modo = { canal: Canal; trocar: boolean; senha?: boolean } | null;

export function CanaisDeContato() {
  const { profile, refreshProfile } = useAuth();
  const p = (profile ?? {}) as PerfilV2;
  const whatsapp = p.whatsapp?.replace(/\D/g, '') ?? '';
  const email = p.email && !ehEmailInterno(p.email) ? p.email : '';
  const whatsappOk = !!p.whatsapp_confirmado_em;
  const emailOk = !!p.email_confirmado_em;

  const [modo, setModo] = useState<Modo>(null);
  const [destino, setDestino] = useState('');
  const [desafio, setDesafio] = useState<RespostaEnvio | null>(null);
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [salvandoPref, setSalvandoPref] = useState(false);

  const fechar = () => { setModo(null); setDestino(''); setDesafio(null); setCodigo(''); setNovaSenha(''); setConfirma(''); };

  const pedir = async () => {
    if (!modo) return;
    setOcupado(true);
    try {
      const r = await canalPedir(modo.canal, modo.trocar ? destino.trim() : undefined);
      setDesafio(r); setCodigo('');
      toast.success(`Código enviado para ${r.destinoMascarado}`);
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally { setOcupado(false); }
  };

  const confirmar = async () => {
    if (!desafio || codigo.length !== 6) return;
    if (modo?.senha) {
      if (novaSenha.length < 6) { toast.error('A senha precisa ter pelo menos 6 caracteres.'); return; }
      if (novaSenha !== confirma) { toast.error('As duas senhas não são iguais.'); return; }
    }
    setOcupado(true);
    try {
      await canalConfirmar(desafio.desafioId, codigo, modo?.senha ? novaSenha : undefined);
      await refreshProfile();
      toast.success(modo?.senha ? 'Senha nova salva!' : modo?.canal === 'whatsapp' ? 'WhatsApp confirmado!' : 'E-mail confirmado!');
      fechar();
    } catch (e) {
      toast.error(mensagemDoErro(e));
      setCodigo('');
    } finally { setOcupado(false); }
  };

  const mudarPreferencia = async (pref: CanalPreferido) => {
    setSalvandoPref(true);
    try {
      await canalPreferencia(pref);
      await refreshProfile();
      toast.success('Preferência salva.');
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally { setSalvandoPref(false); }
  };

  const tituloDialogo = !modo ? '' : modo.senha
    ? 'Trocar a senha'
    : modo.canal === 'whatsapp' ? (modo.trocar ? (whatsapp ? 'Trocar o WhatsApp' : 'Adicionar WhatsApp') : 'Confirmar o WhatsApp')
    : (modo.trocar ? (email ? 'Trocar o e-mail' : 'Adicionar e-mail') : 'Confirmar o e-mail');

  const podeSenhaPorCodigo = whatsappOk || emailOk;
  const canalDaSenha: Canal = whatsappOk && (p.canal_preferido !== 'email' || !emailOk) ? 'whatsapp' : 'email';

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-xl hover:border-primary/30 transition-colors duration-300">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><MessageCircle className="w-5 h-5 text-primary" /></div>
          <div>
            <CardTitle className="text-lg">Como falamos com você</CardTitle>
            <CardDescription className="text-xs">Por onde chegam o código de acesso e os seus ingressos</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* WhatsApp */}
        <div className="rounded-xl bg-secondary/30 border border-border/50 p-4 flex flex-wrap items-center gap-3">
          <MessageCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{whatsapp ? formatarTelefone(whatsapp) : 'Nenhum WhatsApp'}</p>
            <p className="text-xs text-muted-foreground">
              {whatsappOk ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3.5 h-3.5" /> Confirmado</span> : whatsapp ? 'Ainda não confirmado' : 'Adicione para receber o código e os ingressos por lá'}
            </p>
          </div>
          <div className="flex gap-2">
            {whatsapp && !whatsappOk && (
              <Button size="sm" variant="hero" onClick={() => setModo({ canal: 'whatsapp', trocar: false })}>Confirmar</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setDestino(''); setModo({ canal: 'whatsapp', trocar: true }); }}>
              {whatsapp ? 'Trocar' : 'Adicionar'}
            </Button>
          </div>
        </div>

        {/* E-mail */}
        <div className="rounded-xl bg-secondary/30 border border-border/50 p-4 flex flex-wrap items-center gap-3">
          <Mail className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium break-all">{email || 'Nenhum e-mail'}</p>
            <p className="text-xs text-muted-foreground">
              {emailOk ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3.5 h-3.5" /> Confirmado</span> : email ? 'Ainda não confirmado por código' : 'Opcional. Se tiver, os ingressos chegam também por aqui'}
            </p>
          </div>
          <div className="flex gap-2">
            {email && !emailOk && (
              <Button size="sm" variant="hero" onClick={() => setModo({ canal: 'email', trocar: false })}>Confirmar</Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setDestino(''); setModo({ canal: 'email', trocar: true }); }}>
              {email ? 'Trocar' : 'Adicionar'}
            </Button>
          </div>
        </div>

        {/* Preferência */}
        {(whatsappOk || emailOk) && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Onde você quer receber os ingressos?</Label>
            <div className="flex flex-wrap gap-2">
              {([
                ['whatsapp', 'WhatsApp', whatsappOk],
                ['email', 'E-mail', emailOk],
                ['ambos', 'Nos dois', whatsappOk && emailOk],
              ] as Array<[CanalPreferido, string, boolean]>).map(([v, label, disponivel]) => (
                <Button key={v} type="button" size="sm" disabled={!disponivel || salvandoPref}
                  variant={(p.canal_preferido ?? (whatsappOk ? 'whatsapp' : 'email')) === v ? 'hero' : 'outline'}
                  onClick={() => mudarPreferencia(v)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Senha com código */}
        {podeSenhaPorCodigo && (
          <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setModo({ canal: canalDaSenha, trocar: false, senha: true })}>
            <KeyRound className="w-4 h-4 text-primary" /> Trocar a senha (com código no {canalDaSenha === 'whatsapp' ? 'WhatsApp' : 'e-mail'})
          </Button>
        )}
      </CardContent>

      <Dialog open={!!modo} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tituloDialogo}</DialogTitle>
            <DialogDescription>
              {desafio ? `Digite o código de 6 números que mandamos para ${desafio.destinoMascarado}.` : 'Vamos mandar um código de 6 números para confirmar.'}
            </DialogDescription>
          </DialogHeader>

          {!desafio ? (
            <div className="space-y-4">
              {modo?.trocar && (
                <div className="space-y-2">
                  <Label>{modo.canal === 'whatsapp' ? 'Novo WhatsApp (com DDD)' : 'Novo e-mail'}</Label>
                  <Input autoFocus type={modo.canal === 'whatsapp' ? 'tel' : 'email'} inputMode={modo.canal === 'whatsapp' ? 'tel' : 'email'}
                    placeholder={modo.canal === 'whatsapp' ? '(00) 00000-0000' : 'seu@email.com'}
                    value={destino} onChange={(e) => setDestino(e.target.value)} className="h-12 text-base" />
                </div>
              )}
              <Button variant="hero" size="lg" className="w-full" onClick={pedir} disabled={ocupado || (modo?.trocar && !destino.trim())}>
                {ocupado ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : 'Mandar o código'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={codigo} onChange={setCodigo} disabled={ocupado} autoFocus>
                  <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-10 text-xl" />)}</InputOTPGroup>
                </InputOTP>
              </div>
              {modo?.senha && (
                <>
                  <div className="space-y-2">
                    <Label>Senha nova</Label>
                    <div className="relative">
                      <Input type={mostrar ? 'text' : 'password'} autoComplete="new-password" placeholder="Pelo menos 6 caracteres"
                        value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} className="h-12 text-base pr-10" />
                      <button type="button" onClick={() => setMostrar(!mostrar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {mostrar ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Digite de novo</Label>
                    <Input type={mostrar ? 'text' : 'password'} autoComplete="new-password" placeholder="A mesma senha"
                      value={confirma} onChange={(e) => setConfirma(e.target.value)} className="h-12 text-base" />
                  </div>
                </>
              )}
              <Button variant="hero" size="lg" className="w-full" onClick={confirmar} disabled={ocupado || codigo.length !== 6}>
                {ocupado ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Conferindo...</> : 'Confirmar'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={pedir} disabled={ocupado}>Não chegou? Mandar de novo</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
