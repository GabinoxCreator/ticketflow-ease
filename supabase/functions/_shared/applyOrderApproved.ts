// Single entry point for transitioning an order to `paid` and reconciling
// any leftover `pending` tickets. Wraps the transactional Postgres RPC
// `apply_order_approved` and dispatches the confirmation email after commit.
//
// Idempotency contract:
//  - First transition (pending -> paid): confirms inventory, validates tickets,
//    increments coupon usage exactly once.
//  - Already paid: only repairs leftover pending tickets (no inventory or
//    coupon side effects). Audited.
//  - Terminal non-paid order (expired/cancelled/failed/...): no mutation,
//    audit_logs gets a critical mismatch entry.

import { sendOrderConfirmationEmailSafe } from "./orderConfirmationEmail.ts";

const SYSTEM_ACTOR = '95628c4a-8040-44ed-83c5-d6a5b8793926';

export interface ApplyOrderApprovedResult {
  first_transition: boolean;
  tickets_fixed: number;
  mismatch: boolean;
  order_status?: string;
}

export async function applyOrderApproved(
  supabase: any,
  args: { orderId: string; mpPaymentId: string; source: string },
): Promise<ApplyOrderApprovedResult> {
  const { orderId, mpPaymentId, source } = args;

  const { data, error } = await supabase.rpc('apply_order_approved', {
    _order_id: orderId,
    _mp_payment_id: mpPaymentId,
  });

  if (error) {
    // Robust audit on RPC failure — never throw before logging.
    try {
      await supabase.from('audit_logs').insert({
        actor_id: SYSTEM_ACTOR,
        action: 'apply_order_approved_failed',
        target_type: 'order',
        target_id: orderId,
        metadata: {
          source,
          mp_payment_id: mpPaymentId,
          error: error.message ?? String(error),
        },
      });
    } catch (_) { /* swallow logging errors */ }
    throw error;
  }

  const result = (data ?? {}) as ApplyOrderApprovedResult;

  // Email only when something material happened (first transition or
  // tickets reconciled after the fact). Helper is fail-soft.
  if (result.first_transition || (result.tickets_fixed ?? 0) > 0) {
    try {
      await sendOrderConfirmationEmailSafe(supabase, { orderId, source });
    } catch (_) { /* never let email break the flow */ }
  }

  return result;
}
