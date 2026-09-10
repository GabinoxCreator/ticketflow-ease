/*
 * Trilha de etapas em bolinhas (cadastro de produtor).
 *
 * ⚠️ O bug que isto conserta (10/09/2026, achado pelo Gabriel a olho nu): cada
 * pedaço da trilha recebia o gradiente INTEIRO da marca —
 * `from-primary to-[hsl(330,85%,60%)]` — então a etapa 1 ia de roxo a rosa, e a
 * etapa 2 recomeçava no roxo. Três serrinhas no lugar de uma progressão:
 *
 *     antes:  [roxo→rosa][roxo→rosa][roxo→rosa]
 *     agora:  [roxo──────────────────────→rosa]
 *
 * O conserto: cada pedaço recebe só a FATIA do gradiente que lhe cabe, pela
 * posição dele na trilha. A cor caminha do indigo ao magenta uma vez só, do
 * começo ao fim — que é o que o gradiente da marca quer dizer.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
}

/** Matiz da marca em `t` (0 = indigo do começo, 1 = magenta do fim). */
const matiz = (t: number) => 250 + (330 - 250) * Math.min(1, Math.max(0, t));
const corEm = (t: number) => `hsl(${matiz(t)} 85% 60%)`;

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, totalSteps, labels }) => {
  // Com uma etapa só não há trilha; evita divisão por zero.
  const vaos = Math.max(1, totalSteps - 1);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          const aqui = idx / vaos;

          return (
            <React.Fragment key={idx}>
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <motion.div
                  className="relative flex items-center justify-center h-8 w-8 rounded-full border-2 text-xs font-semibold transition-colors"
                  style={
                    isCompleted
                      ? { borderColor: corEm(aqui), background: corEm(aqui), color: 'hsl(var(--primary-foreground))' }
                      : isActive
                      ? { borderColor: corEm(aqui), background: `hsl(${matiz(aqui)} 85% 60% / 0.12)`, color: corEm(aqui) }
                      : undefined
                  }
                  animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 1.5, repeat: isActive ? Infinity : 0 }}
                >
                  {!isCompleted && !isActive && (
                    <span className="absolute inset-0 rounded-full border-2 border-border bg-card" />
                  )}
                  <span className={isCompleted || isActive ? '' : 'relative text-muted-foreground'}>
                    {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
                  </span>
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ boxShadow: `0 0 20px hsl(${matiz(aqui)} 85% 60% / 0.5)` }}
                      animate={{ opacity: [0.4, 0.8, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                </motion.div>
                {labels?.[idx] && (
                  <span className={`text-[10px] font-medium hidden sm:block ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {labels[idx]}
                  </span>
                )}
              </div>

              {idx < totalSteps - 1 && (
                <div className="flex-1 h-0.5 rounded-full bg-border overflow-hidden -mt-4">
                  <motion.div
                    className="h-full"
                    // A fatia do gradiente que cabe a ESTE vão — é isto que faz a
                    // cor atravessar a trilha inteira uma vez só.
                    style={{ background: `linear-gradient(90deg, ${corEm(idx / vaos)}, ${corEm((idx + 1) / vaos)})` }}
                    initial={{ width: '0%' }}
                    animate={{ width: stepNum < currentStep ? '100%' : '0%' }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default StepIndicator;
