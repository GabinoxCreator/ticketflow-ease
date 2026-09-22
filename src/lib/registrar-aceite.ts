/*
 * Registra o aceite de quem está comprando, no momento em que ela escolhe como
 * pagar — que é onde o aviso aparece na tela.
 *
 * Por que daqui e não de dentro das edges de pagamento: são sete portas
 * diferentes (PIX e cartão, Mercado Pago e Marcel, ingresso e mesa). Ligar em
 * sete é esquecer numa. A função do banco usa `auth.uid()`, então não há
 * usuario_id para forjar — ver a migration 20260921180000.
 *
 * NUNCA lança e nunca bloqueia: perder o registro de um aceite é ruim, impedir
 * alguém de pagar é pior.
 */
import { supabase } from '@/integrations/supabase/client';
import { VERSOES_CHECKOUT } from '@/lib/documentos-legais';

type ContextoDeCompra = 'checkout' | 'checkout_mesa';

export async function registrarAceiteDaCompra(contexto: ContextoDeCompra, pedidoId?: string | null) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // compra sem conta não passa por aqui hoje
    // Cast porque `types.ts` é auto-gerado e só vai conhecer esta função depois
    // que a migration subir e o Lovable regerar o arquivo. Mesmo padrão que o
    // repositório já usa para tabela fora do types (`supabase.from as any`).
    await (supabase.rpc as any)('registrar_meu_aceite', {
      _versoes: VERSOES_CHECKOUT,
      _contexto: contexto,
      _pedido_id: pedidoId ?? null,
    });
  } catch (e) {
    console.error('[aceite] não gravado na compra', e);
  }
}
