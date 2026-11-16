// deno test supabase/functions/_shared/taxaNaPorta.test.ts
//
// OS-432 ("Porta segue o lote", decisão do Gabriel de 16/11/2026): na porta, o lote
// "Sem taxa" custa só a face, em Pix, cartão e dinheiro; o lote normal continua com a
// taxa por cima. Números do Fogo & Fumaça no ar em 16/11: taxa 12% no Pix e no
// cartão, "2º lote" R$ 389 ("Sem taxa") e "1º lote" R$ 350 (normal).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contaDaPorta, loteSemTaxa } from "./taxaNaPorta.ts";

const DOZE = { percent: 12, fixed: 0 };
const semTaxa = (q = 1) => ({ lotId: "sem", lotName: "2º lote", unitPrice: 389, quantity: q, modoTaxa: "absorve" });
const normal = (q = 1) => ({ lotId: "nor", lotName: "1º lote", unitPrice: 350, quantity: q, modoTaxa: "cliente_paga" });

Deno.test("só 'absorve' exato é Sem taxa (mesmo critério do site)", () => {
  assertEquals(loteSemTaxa("absorve"), true);
  for (const m of ["cliente_paga", "ABSORVE", "", null, undefined, "absorve "]) assertEquals(loteSemTaxa(m), false);
});

Deno.test("pedido todo Sem taxa: taxa 0 e a face com 12% gravado", () => {
  const c = contaDaPorta([semTaxa(2)], DOZE);
  assertEquals(c.serviceFee, 0);
  assertEquals(c.baseDaTaxa, 0);
  assertEquals(c.faceLines, [
    { lotId: "sem", lotName: "2º lote", unitFace: 389, quantity: 2, modoTaxa: "cliente_paga", taxaAbsorvidaPct: 12 },
  ]);
});

Deno.test("pedido todo Sem taxa não paga nem a parte fixa", () => {
  assertEquals(contaDaPorta([semTaxa()], { percent: 12, fixed: 2 }).serviceFee, 0);
});

Deno.test("lote normal: taxa por cima igual à de antes, percentual vazio", () => {
  const c = contaDaPorta([normal(2)], DOZE);
  assertEquals(c.serviceFee, 84); // 700 × 12%
  assertEquals(c.faceLines[0].taxaAbsorvidaPct, null);
  assertEquals(c.faceLines[0].modoTaxa, "cliente_paga");
});

Deno.test("os dois lotes no mesmo pedido: taxa só na linha normal, percentual só na Sem taxa", () => {
  const c = contaDaPorta([normal(), semTaxa()], DOZE);
  assertEquals(c.baseDaTaxa, 350);
  assertEquals(c.serviceFee, 42);
  assertEquals(c.faceLines.map((l) => [l.lotId, l.taxaAbsorvidaPct]), [["nor", null], ["sem", 12]]);
});

Deno.test("nunca as duas coisas na mesma linha: linha com percentual não entra na base da taxa", () => {
  for (const linhas of [[semTaxa()], [normal()], [normal(3), semTaxa(2)]]) {
    const c = contaDaPorta(linhas, DOZE);
    const baseDasComPercentual = c.faceLines
      .filter((l) => l.taxaAbsorvidaPct !== null)
      .reduce((s, l) => s + l.unitFace * l.quantity, 0);
    const totalFace = c.faceLines.reduce((s, l) => s + l.unitFace * l.quantity, 0);
    assertEquals(c.baseDaTaxa + baseDasComPercentual, totalFace);
  }
});

Deno.test("mesmo lote repetido no pedido vira UMA linha de face com a soma", () => {
  const c = contaDaPorta([semTaxa(1), normal(1), semTaxa(2)], DOZE);
  assertEquals(c.faceLines.length, 2);
  assertEquals(c.faceLines.find((l) => l.lotId === "sem")!.quantity, 3);
});

Deno.test("Porcada (Pix 0%): Sem taxa grava 0, não vazio", () => {
  const c = contaDaPorta([semTaxa()], { percent: 0, fixed: 0 });
  assertEquals(c.faceLines[0].taxaAbsorvidaPct, 0);
  assertEquals(c.serviceFee, 0);
});

Deno.test("sem meio de pagamento (chamada antiga): sem taxa e sem percentual, como sempre", () => {
  const c = contaDaPorta([normal(), semTaxa()], null);
  assertEquals(c.serviceFee, 0);
  assertEquals(c.faceLines.map((l) => l.taxaAbsorvidaPct), [null, null]);
});

Deno.test("percentual com mais de 2 casas vai como a coluna guarda", () => {
  assertEquals(contaDaPorta([semTaxa()], { percent: 8.335, fixed: 0 }).faceLines[0].taxaAbsorvidaPct, 8.34);
});
