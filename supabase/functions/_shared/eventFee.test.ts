// deno test supabase/functions/_shared/eventFee.test.ts
//
// OS-412: venda em dinheiro na maquininha cobra a taxa do evento como cartão e Pix
// (decisão do Gabriel de 09/11/2026). Quando o Pix e o cartão têm taxas diferentes,
// o dinheiro segue TAXA_DO_DINHEIRO_SEGUE (hoje, a do Pix). As taxas abaixo são as
// do banco do ar em 09/11: Porcada (Pix 0%, cartão 10%) e Fogo & Fumaça (12% e 12%).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeServiceFee,
  feeMethodFromPaymentMethod,
  resolveFee,
  TAXA_DO_DINHEIRO_SEGUE,
} from "./eventFee.ts";

const PORCADA = "4d0cfbee-7207-4dd4-b3be-c7bc9151bd1f";
const FOGO = "d9945e04-78e4-4b28-8913-0fc5adfbbeab";
const SEM_LINHA = "f0000000-0000-4412-8000-000000000001";
const TAXAS = [
  { event_id: PORCADA, payment_method: "pix", fee_percent: 0, fee_fixed: 0 },
  { event_id: PORCADA, payment_method: "card", fee_percent: 10, fee_fixed: 0 },
  { event_id: FOGO, payment_method: "pix", fee_percent: 12, fee_fixed: 0 },
  { event_id: FOGO, payment_method: "card", fee_percent: 12, fee_fixed: 0 },
];

// Banco de mentira mínimo: from(t).select().eq(c, v).eq(c, v).maybeSingle().
// deno-lint-ignore no-explicit-any
function bancoDeMentira(): any {
  return {
    from: (_t: string) => {
      const filtros: Array<[string, string]> = [];
      const q = {
        select: () => q,
        eq: (c: string, v: string) => { filtros.push([c, v]); return q; },
        maybeSingle: () =>
          Promise.resolve({
            data: TAXAS.find((l) => filtros.every(([c, v]) => (l as Record<string, unknown>)[c] === v)) ?? null,
            error: null,
          }),
      };
      return q;
    },
  };
}

// A taxa que a edge collaborator-reserve-order cobra: mesmo caminho dela.
async function taxaDaReserva(ev: string, paymentMethod: unknown, subtotal: number) {
  const m = feeMethodFromPaymentMethod(paymentMethod);
  const fee = m ? await resolveFee(bancoDeMentira(), ev, m) : { percent: 0, fixed: 0 };
  return computeServiceFee(subtotal, fee);
}

Deno.test("cada forma de pagamento cai no método de taxa certo", () => {
  assertEquals(feeMethodFromPaymentMethod("pix"), "pix");
  assertEquals(feeMethodFromPaymentMethod("card"), "card");
  assertEquals(feeMethodFromPaymentMethod("card_credit"), "card");
  assertEquals(feeMethodFromPaymentMethod("card_debit"), "card");
  assertEquals(feeMethodFromPaymentMethod("cash"), TAXA_DO_DINHEIRO_SEGUE);
});

Deno.test("hoje o dinheiro segue a taxa do Pix", () => {
  assertEquals(TAXA_DO_DINHEIRO_SEGUE, "pix");
  assertEquals(feeMethodFromPaymentMethod("cash"), "pix");
});

Deno.test("sem método, ou método que não é de venda, continua sem taxa", () => {
  for (const m of [undefined, null, "", "courtesy", "dinheiro", "CASH", "festcash", 0]) {
    assertEquals(feeMethodFromPaymentMethod(m), null, String(m));
  }
});

Deno.test("Porcada: dinheiro segue o Pix (0%), cartão continua 10%", async () => {
  assertEquals(await taxaDaReserva(PORCADA, "cash", 90), 0);
  assertEquals(await taxaDaReserva(PORCADA, "pix", 90), 0);
  assertEquals(await taxaDaReserva(PORCADA, "card_credit", 90), 9);
  assertEquals(await taxaDaReserva(PORCADA, "card_debit", 90), 9);
});

Deno.test("Fogo: dinheiro cobra os 12%, como cartão e Pix", async () => {
  assertEquals(await taxaDaReserva(FOGO, "cash", 389), 46.68);
  assertEquals(await taxaDaReserva(FOGO, "pix", 389), 46.68);
  assertEquals(await taxaDaReserva(FOGO, "card_credit", 389), 46.68);
  // As 8 vendas em dinheiro do Fogo (R$ 3.112) teriam pago R$ 373,44 de taxa.
  assertEquals(await taxaDaReserva(FOGO, "cash", 3112), 373.44);
});

Deno.test("evento sem linha de taxa: dinheiro cai no padrão de 10%, como os outros", async () => {
  assertEquals(await taxaDaReserva(SEM_LINHA, "cash", 100), 10);
  assertEquals(await taxaDaReserva(SEM_LINHA, "pix", 100), 10);
  assertEquals(await taxaDaReserva(SEM_LINHA, "card_debit", 100), 10);
});

Deno.test("sem método continua sem taxa (chamada antiga)", async () => {
  assertEquals(await taxaDaReserva(FOGO, undefined, 389), 0);
});
