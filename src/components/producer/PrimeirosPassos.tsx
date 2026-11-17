/**
 * Primeiros passos do produtor (OS-408, etapa 5, item 5.2).
 *
 * Quatro passos com a marca de feito, cada um levando à tela certa:
 *  1. Dados da produtora: nome da marca e CPF/CNPJ da produtora preenchidos e válidos
 *     (o mesmo critério das pendências do repasse, `minhas_pendencias_de_repasse`:
 *     sem `missing_document` nem `invalid_document`). Decisão do chat de 10/11.
 *  2. Conta bancária e PIN: conta cadastrada com o documento do titular válido (a mesma
 *     função: sem `no_bank_account` nem `missing_holder_document`) e o PIN criado (`meu_pin`).
 *  3. Primeiro evento: já criou algum evento.
 *  4. Colaborador da portaria: já criou algum colaborador.
 *
 * Aparece ENQUANTO faltar um passo, mesmo para quem já tem evento (decisão do Gabriel de
 * 10/11, "Enquanto faltar um passo"), e some quando os quatro estão feitos. Só para o dono
 * da produtora (é quem cadastra conta e PIN); a casa (admin) não vê. Só leitura.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Building2, Landmark, CalendarPlus, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMeuPin } from '@/lib/pinRepasse';
import { useCollaborators } from '@/hooks/useCollaborators';

type Passo = { chave: string; nome: string; feito: boolean; para: string; icone: typeof Building2 };

/** O que falta para o repasse (mesma função do Financeiro). Sem produtora = falta tudo. */
function usePendencias() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['primeiros-passos', 'pendencias', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<string[]> => {
      // Função fora dos tipos gerados (types.ts é do Lovable): chamada sem tipo.
      const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc('minhas_pendencias_de_repasse');
      if (error) throw error;
      const r = data as { ok?: boolean; error?: string; pendencias?: unknown } | null;
      if (r?.ok && Array.isArray(r.pendencias)) return r.pendencias.filter((p): p is string => typeof p === 'string');
      if (r?.error === 'no_producer_profile') return ['missing_document', 'no_bank_account'];
      throw new Error(r?.error || 'falha');
    },
  });
}

function useNomeDaMarca() {
  const { producerProfileId } = useAuth();
  return useQuery({
    queryKey: ['primeiros-passos', 'marca', producerProfileId],
    enabled: !!producerProfileId,
    queryFn: async () => {
      const { data, error } = await supabase.from('producer_profiles').select('brand_name').eq('id', producerProfileId as string).maybeSingle();
      if (error) throw error;
      return (data?.brand_name || '').trim();
    },
  });
}

export function usePrimeirosPassos(temEvento: boolean) {
  const { producerProfileId } = useAuth();
  const pin = useMeuPin();
  const pendencias = usePendencias();
  const marca = useNomeDaMarca();
  const { collaborators, isLoading: carregandoColaboradores } = useCollaborators();

  const carregando = pin.isLoading || pendencias.isLoading || (!!producerProfileId && marca.isLoading) || carregandoColaboradores;
  // Sem saber, não mostra (melhor não aparecer do que mostrar passo errado).
  const sabe = !carregando && !pin.error && !pendencias.error && !marca.error && !!pin.data;
  const dono = !!pin.data?.dono_de_produtora && !pin.data?.admin;
  const p = pendencias.data || [];

  const passos: Passo[] = [
    {
      chave: 'dados', nome: 'Dados da produtora', para: '/produtor/configuracoes', icone: Building2,
      feito: !!producerProfileId && !!marca.data && !p.includes('missing_document') && !p.includes('invalid_document'),
    },
    {
      chave: 'conta', nome: 'Conta bancária e PIN', para: '/produtor/financeiro?aba=dados', icone: Landmark,
      feito: !p.includes('no_bank_account') && !p.includes('missing_holder_document') && !!pin.data?.tem_pin,
    },
    { chave: 'evento', nome: 'Primeiro evento', para: '/produtor/criar-evento', icone: CalendarPlus, feito: temEvento },
    { chave: 'colaborador', nome: 'Colaborador da portaria', para: '/produtor/equipe', icone: Users, feito: collaborators.length > 0 },
  ];
  const feitos = passos.filter((x) => x.feito).length;
  return { mostrar: sabe && dono && feitos < passos.length, passos, feitos };
}

export function PrimeirosPassos({ passos, feitos, compacto = false }: { passos: Passo[]; feitos: number; compacto?: boolean }) {
  const navigate = useNavigate();
  return (
    <section
      aria-label="Primeiros passos"
      className="relative rounded-2xl border border-primary/20 bg-card/60 backdrop-blur overflow-hidden h-full"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-pink-500" />
      <div className="p-5 md:p-6">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-base md:text-lg font-semibold">Primeiros passos</h2>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{feitos} de {passos.length} feitos</span>
        </div>
        <ol className={`grid gap-2 ${compacto ? 'sm:grid-cols-2 xl:grid-cols-4' : ''}`}>
          {passos.map((x, i) => (
            <li key={x.chave}>
              <button
                type="button"
                onClick={() => navigate(x.para)}
                data-passo={x.chave}
                data-feito={x.feito ? 'sim' : 'nao'}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  x.feito
                    ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
                    : 'border-primary/20 bg-background/40 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${x.feito ? 'bg-emerald-500/15' : 'bg-primary/15'}`}>
                  {x.feito ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <x.icone className="h-4 w-4 text-primary" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i + 1}. {x.nome}</span>
                  <span className={`block text-xs ${x.feito ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{x.feito ? 'Feito' : 'Falta fazer'}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
