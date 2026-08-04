import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Coins, DoorOpen, ScanFace, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Convite da facial no fim do cadastro. Etapa OPCIONAL: "Agora não" segue o fluxo
// normal. O consentimento é específico e prévio (biometria = dado sensível, LGPD
// art. 11) — sem o checkbox marcado a câmera nem abre.
interface FacialInviteModalProps {
  onActivate: () => void;
  onSkip: () => void;
}

const BENEFITS = [
  { icon: DoorOpen, title: 'Check-in sem fila', desc: 'Entre olhando pra câmera' },
  { icon: Coins, title: 'Fichas no totem', desc: 'Compre com o rosto' },
  { icon: Zap, title: 'Mais rápido', desc: 'Sem procurar o QR' },
  { icon: ShieldCheck, title: 'Mais seguro', desc: 'Só você usa seu ingresso' },
];

const FacialInviteModal: React.FC<FacialInviteModalProps> = ({ onActivate, onSkip }) => {
  const [consent, setConsent] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-pink-500 text-primary-foreground">
          <ScanFace className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl font-bold tracking-tight">Ative seu acesso facial</h3>
          <p className="text-sm text-muted-foreground">
            Uma foto agora e você entra no evento sem ingresso na mão.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {BENEFITS.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-3 text-left"
          >
            <Icon className="h-5 w-5 text-primary" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-tight">{title}</p>
              <p className="text-xs leading-snug text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mesmo padrão de aceite do StepPassword (checkbox custom acessível). */}
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors ${
          consent ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        style={{ borderWidth: '0.5px', borderStyle: 'solid' }}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="sr-only peer"
        />
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${
            consent ? 'bg-primary border-primary' : 'bg-transparent border-foreground/40'
          }`}
          style={{ borderWidth: '1.5px', borderStyle: 'solid' }}
          aria-hidden="true"
        >
          {consent && <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">
          Autorizo o uso da minha foto para reconhecimento facial no check-in e pagamentos,
          conforme a{' '}
          <a
            href="/privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-[3px]"
            onClick={(e) => e.stopPropagation()}
          >
            Política de Privacidade
          </a>
          .
        </span>
      </label>

      <div className="space-y-3">
        <Button
          type="button"
          variant={consent ? 'hero' : 'secondary'}
          size="lg"
          className={
            consent ? 'w-full gap-2' : 'w-full gap-2 bg-muted text-muted-foreground/60 disabled:opacity-100'
          }
          onClick={onActivate}
          disabled={!consent}
        >
          <ScanFace className="h-4 w-4" />
          Ativar facial
        </Button>
        <Button type="button" variant="ghost" size="lg" className="w-full" onClick={onSkip}>
          Agora não
        </Button>
      </div>

      {!consent && (
        <p className="text-center text-[12px] text-muted-foreground">
          Marque o consentimento para ativar
        </p>
      )}
    </motion.div>
  );
};

export default FacialInviteModal;
