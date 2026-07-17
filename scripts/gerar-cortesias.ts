/**
 * scripts/gerar-cortesias.ts
 *
 * Gera cortesias dos patrocinadores da "Feijuca da Ana" chamando a edge
 * admin-generate-courtesy-tickets (uma chamada por patrocinador, sequencial) e
 * salva um PDF por patrocinador usando o TEMPLATE REAL (src/utils/ticketPdfTemplate.ts).
 *
 * SEGURANÇA / EXECUÇÃO:
 *   - Sem flag ou com --dry-run  -> só imprime o payload, NÃO chama a edge (default).
 *   - --run                      -> chama a edge de verdade (exige ADMIN_JWT no ambiente).
 *   - --only=NOME                -> processa só o patrocinador cujo nome casar.
 *
 *   bun run scripts/gerar-cortesias.ts               # dry-run (nada é enviado)
 *   bun run scripts/gerar-cortesias.ts --only=Baroni # dry-run de um só
 *   bun run scripts/gerar-cortesias.ts --run         # chama a edge (produção!)
 *
 * O token vem de process.env.ADMIN_JWT (use um .env local — .env está no .gitignore).
 * NUNCA hardcode o token aqui. O template NÃO é alterado; só instalamos shims de
 * browser (FileReader/Image/fetch) para o loadLogo() funcionar fora do navegador.
 */
import fs from 'node:fs';
import path from 'node:path';

/* ================================================================== */
/* Constantes do evento/lote                                          */
/* ================================================================== */

const EVENT_ID = 'a8ceede6-37d8-4be4-8a60-f4539024f747';
const LOT_ID = '33a73365-d63b-4553-9b97-d1e520b45160';

/* ================================================================== */
/* Tipo do patrocinador                                               */
/* A LISTA REAL (nome/qtd/email/CPF) NÃO fica no código: vive em       */
/* scripts/sponsors.local.json (gitignored por *.local.json), lida em  */
/* runtime por loadSponsors(). Nunca versionar CPF/e-mail.             */
/* ================================================================== */

interface Sponsor {
  name: string;
  quantity: number;
  email: string;
  cpf: string;
}

/* ================================================================== */
/* Shims mínimos de browser (ANTES de importar o template)            */
/* ================================================================== */

const nativeFetch = globalThis.fetch;

// FileReader: readAsDataURL(blob) -> this.result = "data:image/png;base64,..."
class NodeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  readAsDataURL(blob: any): void {
    Promise.resolve()
      .then(async () => {
        const ab =
          blob && typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
        this.result = `data:image/png;base64,${Buffer.from(ab).toString('base64')}`;
        this.onload?.();
      })
      .catch((e) => this.onerror?.(e));
  }
}

// Image: lê naturalWidth/naturalHeight do cabeçalho IHDR do PNG (bytes 16-23, BE).
class NodeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  private _src = '';
  set src(value: string) {
    this._src = value;
    try {
      const comma = value.indexOf(',');
      const buf = Buffer.from(comma >= 0 ? value.slice(comma + 1) : value, 'base64');
      this.naturalWidth = buf.readUInt32BE(16);
      this.naturalHeight = buf.readUInt32BE(20);
      queueMicrotask(() => this.onload?.());
    } catch (e) {
      queueMicrotask(() => this.onerror?.(e));
    }
  }
  get src(): string {
    return this._src;
  }
}

// fetch: url local (não-http) -> lê do disco e devolve algo com .blob();
// url http(s) -> delega para o fetch nativo do bun (usado pelas chamadas à edge).
const shimFetch = async (url: any, init?: any): Promise<any> => {
  if (typeof url === 'string' && !/^https?:/i.test(url)) {
    const p = url.startsWith('file://') ? new URL(url).pathname : url;
    return { blob: async () => new Blob([fs.readFileSync(p)]) };
  }
  return nativeFetch(url, init);
};

(globalThis as any).FileReader = NodeFileReader;
(globalThis as any).Image = NodeImage;
(globalThis as any).fetch = shimFetch;

/* ================================================================== */
/* Template REAL + jsPDF + supabase (importados DEPOIS dos shims)     */
/* ================================================================== */

const { default: jsPDF } = await import('jspdf');
const { renderTicketPage, slugifyForFilename } = await import('@/utils/ticketPdfTemplate');
const { createClient } = await import('@supabase/supabase-js');

/* ================================================================== */
/* Ambiente / CLI                                                     */
/* ================================================================== */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const ADMIN_JWT = process.env.ADMIN_JWT ?? '';
const EDGE_URL = `${SUPABASE_URL}/functions/v1/admin-generate-courtesy-tickets`;

const argv = process.argv.slice(2);
const RUN = argv.includes('--run');
const DRY = !RUN; // default = dry-run: nada é enviado sem --run explícito
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice('--only='.length).trim().toLowerCase() : null;

const OUT_DIR = path.resolve('cortesias-out');
const SPONSORS_FILE = path.join(import.meta.dir, 'sponsors.local.json');

// Carrega a lista de patrocinadores do JSON local. Aborta claro se faltar.
function loadSponsors(): Sponsor[] {
  if (!fs.existsSync(SPONSORS_FILE)) {
    console.error(`ERRO: lista de patrocinadores não encontrada em:\n  ${SPONSORS_FILE}`);
    console.error('Crie scripts/sponsors.local.json com um array JSON de { name, quantity, email, cpf }.');
    console.error('(o arquivo é gitignored — contém CPF/e-mail; nunca versionar.)');
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(SPONSORS_FILE, 'utf8'));
  } catch (e: any) {
    console.error(`ERRO: JSON inválido em ${SPONSORS_FILE}: ${e?.message ?? e}`);
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error(`ERRO: ${SPONSORS_FILE} deve conter um array JSON.`);
    process.exit(1);
  }
  return parsed as Sponsor[];
}

const SPONSORS = loadSponsors();

interface EdgeTicket {
  id: string;
  ticket_code: string;
  lot_name: string;
  holder_name: string;
}
interface EventInfo {
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  state: string;
}

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */

function noteFor(s: Sponsor): string {
  return `Cortesia patrocinador Feijuca da Ana - CPF ${s.cpf}`;
}

function payloadFor(s: Sponsor) {
  return {
    event_id: EVENT_ID,
    lot_id: LOT_ID,
    quantity: s.quantity,
    holder_name: s.name,
    holder_email: s.email,
    note: noteFor(s),
  };
}

async function fetchEvent(): Promise<EventInfo> {
  const supa = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await supa
    .from('events')
    .select('title, date, time, venue, city, state')
    .eq('id', EVENT_ID)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`evento não encontrado (${EVENT_ID}): ${error?.message ?? 'sem linha'}`);
  }
  return data as EventInfo;
}

async function generatePdf(tickets: EdgeTicket[], event: EventInfo, outPath: string): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const issuedAt = new Date();
  for (let i = 0; i < tickets.length; i++) {
    if (i > 0) pdf.addPage();
    const t = tickets[i];
    await renderTicketPage(pdf, {
      event,
      lot: { name: t.lot_name },
      ticket: { ticket_code: t.ticket_code, holder_name: t.holder_name },
      issuedAt,
    });
  }
  fs.writeFileSync(outPath, Buffer.from(pdf.output('arraybuffer')));
}

// Uma chamada à edge, raw fetch, lendo o corpo independente do status.
async function callEdge(s: Sponsor): Promise<{ status: number; body: any }> {
  const res = await nativeFetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ADMIN_JWT}`,
    },
    body: JSON.stringify(payloadFor(s)),
  });
  const body = await res.json().catch(() => ({ ok: false, error: 'resposta não-JSON' }));
  return { status: res.status, body };
}

/* ================================================================== */
/* Execução                                                           */
/* ================================================================== */

const alvo = ONLY ? SPONSORS.filter((s) => s.name.toLowerCase().includes(ONLY)) : SPONSORS;

console.log('='.repeat(64));
console.log(`Cortesias Feijuca da Ana — ${DRY ? 'DRY-RUN (nada é enviado)' : 'RUN (chamando a edge!)'}`);
console.log(`Patrocinadores na lista: ${SPONSORS.length}${ONLY ? ` | filtro --only=${ONLY} -> ${alvo.length}` : ''}`);
console.log('='.repeat(64));

if (SPONSORS.length === 0) {
  console.log('\n⚠  SPONSORS está vazio — preencha a lista dos 22 patrocinadores no script.');
}

let event: EventInfo | null = null;
let okCount = 0;
let errCount = 0;
let totalTickets = 0;

if (RUN) {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error('ERRO: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ausentes no ambiente (.env).');
    process.exit(1);
  }
  if (!ADMIN_JWT) {
    console.error('ERRO: ADMIN_JWT ausente. Defina no .env local (nunca commitar).');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  event = await fetchEvent(); // busca o evento uma vez, no início
  console.log(`Evento: ${event.title} — ${event.date} ${event.time} — ${event.venue} (${event.city}/${event.state})\n`);
}

for (const s of alvo) {
  const outFile = path.join(OUT_DIR, `Feijuca-${slugifyForFilename(s.name)}-${s.quantity}-convites.pdf`);

  if (DRY) {
    console.log(`[DRY] ${s.name} — qtd ${s.quantity}`);
    console.log(`      payload: ${JSON.stringify(payloadFor(s))}`);
    console.log(`      arquivo (se rodasse): ${path.relative(process.cwd(), outFile)}`);
    continue;
  }

  try {
    const { status, body } = await callEdge(s);
    if (body?.ok === true) {
      const tickets: EdgeTicket[] = body.tickets ?? [];
      await generatePdf(tickets, event!, outFile);
      okCount++;
      totalTickets += tickets.length;
      console.log(
        `[OK ] ${s.name} — qtd ${s.quantity} — status ${status} — order ${body.order_id} — ${tickets.length} ingresso(s) — ${path.relative(process.cwd(), outFile)}`,
      );
    } else {
      errCount++;
      console.log(
        `[ERR] ${s.name} — qtd ${s.quantity} — status ${status} — erro: ${JSON.stringify(body)}`,
      );
    }
  } catch (e: any) {
    errCount++;
    console.log(`[ERR] ${s.name} — qtd ${s.quantity} — exceção: ${e?.message ?? String(e)}`);
  }
}

console.log('\n' + '='.repeat(64));
if (DRY) {
  const previstos = alvo.reduce((n, s) => n + s.quantity, 0);
  console.log(`Resumo (dry-run): ${alvo.length} patrocinador(es), ${previstos} ingresso(s) previstos — nada enviado. Rode com --run para valer.`);
} else {
  console.log(`Resumo: ${okCount} ok, ${errCount} erro(s), ${totalTickets} ingresso(s) gerados.`);
}
console.log('='.repeat(64));
