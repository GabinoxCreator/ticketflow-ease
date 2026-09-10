/*
 * A barra de etapas do cadastro de cliente.
 *
 * Substitui os seis tracinhos que existiam antes, e que tinham dois problemas.
 * O visível, apontado pelo Gabriel em 10/09: cada tracinho carregava o
 * gradiente INTEIRO da marca, então a cor ia de roxo a rosa e recomeçava no
 * roxo a cada etapa — "parece serviço de criança", e ele estava certo.
 *
 * O outro problema é que tracinho a pessoa tem de CONTAR para saber onde está.
 * Aqui a barra é uma só, o gradiente atravessa ela inteira uma vez, e o texto
 * diz em palavras onde a pessoa está.
 *
 * O truque do gradiente: a faixa colorida tem SEMPRE a largura total e é
 * recortada por `clip-path`. Assim o magenta mora no fim da barra e só chega
 * quando o cadastro chega — em vez de reaparecer a cada pedaço.
 */
import React from 'react';

interface BarraDeEtapasProps {
  /** Etapa atual, começando em 1. */
  atual: number;
  total: number;
  /** O nome da etapa, em palavras: "Onde falamos", "Sua senha"… */
  nome: string;
}

export const BarraDeEtapas: React.FC<BarraDeEtapasProps> = ({ atual, total, nome }) => {
  const fracao = Math.min(1, Math.max(0, atual / total));
  const queFalta = `${((1 - fracao) * 100).toFixed(1)}%`;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">{nome}</span>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          Etapa {atual} de {total}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={atual}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Etapa ${atual} de ${total}: ${nome}`}
      >
        <div
          className="h-full w-full rounded-full transition-[clip-path] duration-500 ease-out"
          style={{
            background:
              'linear-gradient(90deg, hsl(250 85% 60%) 0%, hsl(290 85% 62%) 50%, hsl(330 85% 60%) 100%)',
            clipPath: `inset(0 ${queFalta} 0 0)`,
          }}
        />
      </div>
    </div>
  );
};

export default BarraDeEtapas;
