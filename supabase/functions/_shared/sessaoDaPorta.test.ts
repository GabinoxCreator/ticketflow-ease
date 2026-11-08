// deno test supabase/functions/_shared/sessaoDaPorta.test.ts
//
// OS-401: a porta de cada sessão quando o evento tem várias sessões no mesmo dia.
// Decisão do Gabriel de 07/11 ("Pelo horário, sozinho"): o corte é o meio do
// caminho entre os inícios. No Balé (18h30 e 20h30), 19h30.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fraseDaSessao, horaComoSeLe, inicioDaSessao, portasDasSessoes, portasDoDia } from "./sessaoDaPorta.ts";
import { horaDoEvento } from "./mapaDoCheckin.ts";

// Banco de mentira mínimo: from(tabela).select(...).in(coluna, valores).
// deno-lint-ignore no-explicit-any
function bancoDeMentira(tabelas: Record<string, any[]>, quebrar = false) {
  return {
    from: (t: string) => ({
      select: () => ({
        in: (col: string, vals: string[]) =>
          Promise.resolve(quebrar ? { data: null, error: { message: "falha" } } : { data: (tabelas[t] ?? []).filter((l) => vals.includes(l[col])), error: null }),
      }),
    }),
  };
}
const LISTA = [
  { event_id: "s1", lista_id: "bale" },
  { event_id: "s2", lista_id: "bale" },
  { event_id: "comum", lista_id: "outra" },
];
const EVENTOS = (statusS2: string) => [
  { id: "s1", date: "2026-12-17", time: "18:30:00", status: "published" },
  { id: "s2", date: "2026-12-17", time: "20:30:00", status: statusS2 },
  { id: "comum", date: "2026-12-17", time: "21:00:00", status: "published" },
];

const s1 = { id: "s1", inicio: inicioDaSessao("2026-12-17", "18:30:00")! };
const s2 = { id: "s2", inicio: inicioDaSessao("2026-12-17", "20:30:00")! };
const as = (hhmm: string) => new Date(`2026-12-17T${hhmm}:00-03:00`);

Deno.test("início e hora em Brasília", () => {
  assertEquals(s1.inicio.toISOString(), "2026-12-17T21:30:00.000Z");
  assertEquals(horaComoSeLe(s1.inicio), "18h30");
  assertEquals(horaComoSeLe(as("20:00")), "20h");
  assertEquals(inicioDaSessao("2026-12-17", null), null);
  assertEquals(inicioDaSessao("2026-12-17", "18:30")!.toISOString(), "2026-12-17T21:30:00.000Z");
});

Deno.test("Balé: até 19h29 só a 1ª; a partir de 19h30 só a 2ª", () => {
  const as1800 = portasDoDia([s1, s2], as("18:00"));
  assertEquals(as1800.get("s1"), { aberta: true, sessao: "18h30" });
  assertEquals(as1800.get("s2"), { aberta: false, sessao: "20h30", motivo: "ainda_nao_abriu", abre_em: "19h30" });

  const as1929 = portasDoDia([s1, s2], new Date(as("19:30").getTime() - 1000));
  assertEquals([as1929.get("s1")!.aberta, as1929.get("s2")!.aberta], [true, false]);

  const as1930 = portasDoDia([s1, s2], as("19:30"));
  assertEquals(as1930.get("s1"), { aberta: false, sessao: "18h30", motivo: "ja_fechou", fechou_em: "19h30" });
  assertEquals(as1930.get("s2"), { aberta: true, sessao: "20h30" });

  // De manhã cedo (a janela do banco abre à 0h): só a 1ª; tarde da noite: só a 2ª.
  assertEquals(portasDoDia([s2, s1], as("08:00")).get("s1")!.aberta, true);
  assertEquals(portasDoDia([s1, s2], as("23:30")).get("s2")!.aberta, true);
});

Deno.test("o corte sai dos horários, não de um número fixo", () => {
  const a = { id: "a", inicio: inicioDaSessao("2026-12-18", "15:00:00")! };
  const b = { id: "b", inicio: inicioDaSessao("2026-12-18", "17:00:00")! };
  const c = { id: "c", inicio: inicioDaSessao("2026-12-18", "21:00:00")! };
  const p = portasDoDia([a, b, c], new Date("2026-12-18T18:30:00-03:00"));
  assertEquals(p.get("a"), { aberta: false, sessao: "15h", motivo: "ja_fechou", fechou_em: "16h" });
  assertEquals(p.get("b"), { aberta: true, sessao: "17h" });
  assertEquals(p.get("c"), { aberta: false, sessao: "21h", motivo: "ainda_nao_abriu", abre_em: "19h" });
});

Deno.test("sessão única (ou nenhuma): sem regra", () => {
  assertEquals(portasDoDia([s1], as("23:59")).size, 0);
  assertEquals(portasDoDia([], as("12:00")).size, 0);
});

Deno.test("a frase da porta", () => {
  assertEquals(
    fraseDaSessao({ aberta: false, sessao: "20h30", motivo: "ainda_nao_abriu", abre_em: "19h30" }),
    "Ingresso da sessão das 20h30. A entrada dessa sessão abre às 19h30.",
  );
  assertEquals(
    fraseDaSessao({ aberta: false, sessao: "18h30", motivo: "ja_fechou", fechou_em: "19h30" }),
    "Ingresso da sessão das 18h30. A entrada dessa sessão fechou às 19h30. Procure a equipe.",
  );
});

Deno.test("pelo banco: só sessão PUBLICADA corta o dia; despublicada não divide mais", async () => {
  const agora = as("20:00");
  const publicada = await portasDasSessoes(bancoDeMentira({ listas_alunos_eventos: LISTA, events: EVENTOS("published") }), ["s1"], "T", agora);
  assertEquals(publicada instanceof Map && publicada.get("s1")?.aberta, false);
  // A 2ª sessão voltou para rascunho: a 1ª fica sozinha no dia e entra a qualquer hora.
  const rascunho = await portasDasSessoes(bancoDeMentira({ listas_alunos_eventos: LISTA, events: EVENTOS("draft") }), ["s1"], "T", agora);
  assertEquals(rascunho instanceof Map && rascunho.size, 0);
  const encerrada = await portasDasSessoes(bancoDeMentira({ listas_alunos_eventos: LISTA, events: EVENTOS("finished") }), ["s1"], "T", agora);
  assertEquals(encerrada instanceof Map && encerrada.size, 0);
});

Deno.test("pelo banco: evento fora de lista ou sozinho na lista não tem regra; erro = 'erro'", async () => {
  const db = bancoDeMentira({ listas_alunos_eventos: LISTA, events: EVENTOS("published") });
  assertEquals(((await portasDasSessoes(db, ["sem-lista"], "T", as("20:00"))) as Map<string, unknown>).size, 0);
  assertEquals(((await portasDasSessoes(db, ["comum"], "T", as("20:00"))) as Map<string, unknown>).size, 0);
  assertEquals(await portasDasSessoes(bancoDeMentira({}, true), ["s1"], "T", as("20:00")), "erro");
});

Deno.test("hora do evento para a tela", () => {
  assertEquals(horaDoEvento("18:30:00"), "18h30");
  assertEquals(horaDoEvento("20:00:00"), "20h");
  assertEquals(horaDoEvento(null), null);
});
