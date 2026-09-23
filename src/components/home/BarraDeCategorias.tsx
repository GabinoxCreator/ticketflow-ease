/*
 * A barra de categorias da home, logo abaixo do banner (pedido do Gabriel,
 * 23/09/2026; referência: a barra da Ingresse e as "coleções" da Sympla).
 *
 * A regra que faz isso funcionar num catálogo pequeno: só entra na barra a
 * categoria que TEM evento na lista. Categoria vazia não aparece, então ninguém
 * clica e cai numa tela sem nada — que é o jeito mais rápido de um site parecer
 * abandonado.
 *
 * Filtra na própria página, sem recarregar nada: os eventos já estão na memória.
 */
import { categoriasComEvento } from '@/lib/categorias-de-evento';

interface Props {
  /** A categoria de cada evento já visível na home. */
  categoriasDosEventos: Array<string | null | undefined>;
  /** null = "Todos". */
  selecionada: string | null;
  aoSelecionar: (slug: string | null) => void;
}

export function BarraDeCategorias({ categoriasDosEventos, selecionada, aoSelecionar }: Props) {
  const categorias = categoriasComEvento(categoriasDosEventos);

  // Com uma categoria só, a barra não ajuda ninguém a filtrar nada.
  if (categorias.length < 2) return null;

  const base =
    'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors border';
  const ativo = 'bg-primary text-primary-foreground border-transparent';
  const inativo = 'bg-card/60 text-muted-foreground border-border/60 hover:text-foreground hover:border-primary/50';

  return (
    <nav aria-label="Categorias de evento" className="border-b border-border/40">
      {/* Rola de lado no celular; no computador cabe tudo. A barra de rolagem
        * fica escondida para não cortar o visual. */}
      <div className="container mx-auto px-4">
        <ul className="flex gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <li>
            <button
              type="button"
              onClick={() => aoSelecionar(null)}
              aria-current={selecionada === null ? 'true' : undefined}
              className={`${base} ${selecionada === null ? ativo : inativo}`}
            >
              Todos
            </button>
          </li>
          {categorias.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => aoSelecionar(selecionada === c.slug ? null : c.slug)}
                aria-current={selecionada === c.slug ? 'true' : undefined}
                className={`${base} ${selecionada === c.slug ? ativo : inativo}`}
              >
                {c.nome}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
