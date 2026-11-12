// OS-426: "sem taxa" tira só a conveniência; o cartão segue a faixa do lote.
// Rodar: deno test supabase/functions/_shared/carrinhoMarcel.os426.test.ts
import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { cartaoAbsorvidoAte, linhasDeFace, type PrecoResolvido } from "./carrinhoMarcel.ts";

Deno.test("lote sem faixa (Fogo): comprador paga o cartão desde 1x", () => {
  assertEquals(cartaoAbsorvidoAte(0, 10), 0);
});

Deno.test("Rodeo: faixa de 3x e de 2x continuam iguais", () => {
  assertEquals(cartaoAbsorvidoAte(3, 10), 3);
  assertEquals(cartaoAbsorvidoAte(2, 10), 2);
});

Deno.test("faixa maior que o teto: sem juros até o teto", () => {
  assertEquals(cartaoAbsorvidoAte(12, 10), 10);
});

const linha = (modoTaxa: string) => ({
  lotId: "l1", lotName: "2º lote", price: 389, quantity: 1, modoTaxa,
}) as unknown as PrecoResolvido["linhas"][number];

Deno.test("linha 'absorve' grava a taxa do evento; 'cliente_paga' grava null", () => {
  const preco = {
    linhas: [linha("absorve"), linha("cliente_paga")], produtos: [],
    totalFace: 778, taxaAdministrativa: 46.68, desconto: 0, cupomId: null,
    subtotal: 824.68, taxaPercent: 12,
  } as PrecoResolvido;
  const [a, c] = linhasDeFace(preco);
  assertEquals(a.taxaAbsorvidaPct, 12);
  assertEquals(c.taxaAbsorvidaPct, null);
});

Deno.test("cartão pago pelo comprador não apaga a taxa absorvida da linha", () => {
  const preco = {
    linhas: [linha("absorve")], produtos: [], totalFace: 389,
    taxaAdministrativa: 0, desconto: 0, cupomId: null, subtotal: 389, taxaPercent: 12,
  } as PrecoResolvido;
  const [a] = linhasDeFace(preco, () => "cliente_paga");
  assertEquals(a.modoTaxa, "cliente_paga");
  assertEquals(a.taxaAbsorvidaPct, 12);
});
