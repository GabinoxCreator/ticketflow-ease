import { useMemo } from 'react';
import type { EventTableRow } from '@/hooks/useEventTables';
import { isEffectivelyAvailable } from '@/hooks/useEventTables';

/**
 * Planta das unidades do evento para o PRODUTOR.
 *
 * Diferente do mapa do comprador (`components/seated/SeatMapRenderer`), que
 * mostra só o que dá para comprar: aqui a cor é o estado de gestão — vendida no
 * site, fechada por fora, segurada num checkout em andamento, bloqueada. É essa
 * leitura que o produtor abre no celular durante a venda.
 *
 * Desenha a partir de x/y/width/height que vêm da própria RPC de gestão, então
 * não depende do snapshot do mapa nem de o evento estar publicado.
 */

type VisualStatus = 'available' | 'sold' | 'manual' | 'held' | 'blocked';

const CORES: Record<VisualStatus, { fill: string; stroke: string; texto: string; rotulo: string }> = {
  // Cores cravadas de propósito: são semânticas de estado, não o tema da marca.
  // Precisam se distinguir no escuro do painel e continuar legíveis lado a lado.
  available: { fill: '#1E9BF033', stroke: '#1E9BF0', texto: '#BFE3FB', rotulo: 'Disponível' },
  sold:      { fill: '#16A34A',   stroke: '#22C55E', texto: '#04140A', rotulo: 'Vendida no site' },
  manual:    { fill: '#D97706',   stroke: '#F59E0B', texto: '#1A0F00', rotulo: 'Fechada por fora' },
  held:      { fill: '#7C3AED',   stroke: '#A78BFA', texto: '#F2ECFF', rotulo: 'Em checkout' },
  blocked:   { fill: '#3F3F46',   stroke: '#71717A', texto: '#D4D4D8', rotulo: 'Bloqueada' },
};

function statusVisual(t: EventTableRow): VisualStatus {
  // Ordem importa: "held expirado" volta a valer como disponível, igual ao gate
  // do hold_seats — senão o mapa mostra ocupado o que o site já liberou.
  if (isEffectivelyAvailable(t)) return 'available';
  if (t.status === 'sold') return 'sold';
  if (t.status === 'manual') return 'manual';
  if (t.status === 'held') return 'held';
  return 'blocked';
}

interface Props {
  seats: EventTableRow[];
  onSelect: (seat: EventTableRow) => void;
  selectedId?: string | null;
}

const PAD = 30;

export function EventTablesMapView({ seats, onSelect, selectedId }: Props) {
  const posicionadas = useMemo(
    () => seats.filter((s) => s.x != null && s.y != null),
    [seats],
  );

  const bbox = useMemo(() => {
    if (posicionadas.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of posicionadas) {
      const w = s.width ?? (s.radius ? s.radius * 2 : 80);
      const h = s.height ?? (s.radius ? s.radius * 2 : 80);
      minX = Math.min(minX, s.x!);
      minY = Math.min(minY, s.y!);
      maxX = Math.max(maxX, s.x! + w);
      maxY = Math.max(maxY, s.y! + h);
    }
    return {
      x: minX - PAD,
      y: minY - PAD,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + PAD * 2,
    };
  }, [posicionadas]);

  const usadas = useMemo(() => {
    const set = new Set<VisualStatus>();
    for (const s of posicionadas) set.add(statusVisual(s));
    return set;
  }, [posicionadas]);

  if (posicionadas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        As unidades deste evento não têm posição no mapa, então não dá para desenhar a planta.
        Use a lista abaixo para gerenciar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-[#0B0E13] overflow-x-auto">
        <svg
          viewBox={`${bbox!.x} ${bbox!.y} ${bbox!.w} ${bbox!.h}`}
          className="w-full h-auto"
          style={{ minHeight: 260, maxHeight: '62vh' }}
          role="img"
          aria-label={`Planta com ${posicionadas.length} unidades`}
        >
          {posicionadas.map((s) => {
            const w = s.width ?? (s.radius ? s.radius * 2 : 80);
            const h = s.height ?? (s.radius ? s.radius * 2 : 80);
            const vs = statusVisual(s);
            const c = CORES[vs];
            const selecionada = selectedId === s.id;
            // Só escreve o número quando cabe — em planta cheia, texto miúdo
            // vira sujeira e atrapalha mais do que ajuda.
            const cabeTexto = w >= 34 && h >= 16;
            const nome = s.label ?? s.code ?? '';
            const curto = nome.replace(/^\D+/, '') || nome;

            return (
              <g
                key={s.id}
                onClick={() => onSelect(s)}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                aria-label={`${nome} — ${c.rotulo}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s); }
                }}
              >
                <title>{`${nome} — ${c.rotulo}`}</title>
                <rect
                  x={s.x!} y={s.y!} width={w} height={h} rx={4}
                  fill={c.fill}
                  stroke={selecionada ? '#FFFFFF' : c.stroke}
                  strokeWidth={selecionada ? 3 : 1.5}
                />
                {cabeTexto && (
                  <text
                    x={s.x! + w / 2}
                    y={s.y! + h / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.min(h * 0.5, 14)}
                    fill={c.texto}
                    fontWeight={600}
                    style={{ pointerEvents: 'none', fontFamily: 'ui-monospace, monospace' }}
                  >
                    {curto}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {(Object.keys(CORES) as VisualStatus[])
          .filter((k) => usadas.has(k))
          .map((k) => (
            <span key={k} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="w-3.5 h-3.5 rounded-sm border"
                style={{ background: CORES[k].fill, borderColor: CORES[k].stroke }}
              />
              {CORES[k].rotulo}
            </span>
          ))}
        <span className="text-xs text-muted-foreground ml-auto">
          Toque numa unidade para ver os detalhes
        </span>
      </div>
    </div>
  );
}
