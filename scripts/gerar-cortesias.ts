/**
 * scripts/gerar-cortesias.ts
 *
 * PASSO 1 (prova de conceito): gera o PDF de ingresso usando o TEMPLATE REAL
 * (src/utils/ticketPdfTemplate.ts) rodando em bun, FORA do browser — sem tocar
 * em edge, banco ou rede. Objetivo: provar que o template roda verbatim e que
 * o LOGO aparece (não cai no fallback de texto).
 *
 * Rodar da RAIZ do projeto:  bun run scripts/gerar-cortesias.ts
 *
 * O template não é alterado. Aqui só instalamos shims mínimos de browser ANTES
 * de importá-lo, para o loadLogo() funcionar: FileReader, Image (dims via IHDR
 * do PNG) e um fetch que lê arquivo local do disco.
 */
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------ */
/* Shims mínimos de browser (ANTES de importar o template)             */
/* ------------------------------------------------------------------ */

// Flags de diagnóstico: provam se o caminho do logo real foi exercitado.
let logoFileRead = false;
let logoImageDecoded = false;

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
          blob && typeof blob.arrayBuffer === 'function'
            ? await blob.arrayBuffer()
            : blob; // já pode ser ArrayBuffer/Buffer
        const buf = Buffer.from(ab);
        this.result = `data:image/png;base64,${buf.toString('base64')}`;
        this.onload?.();
      })
      .catch((e) => this.onerror?.(e));
  }
}

// Image: lê naturalWidth/naturalHeight do cabeçalho IHDR do PNG.
// PNG = 8 bytes de assinatura + chunk IHDR (len 4 + type 4) => dados no offset 16.
// width = bytes 16..19 (BE), height = bytes 20..23 (BE).
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
      const b64 = comma >= 0 ? value.slice(comma + 1) : value;
      const buf = Buffer.from(b64, 'base64');
      this.naturalWidth = buf.readUInt32BE(16);
      this.naturalHeight = buf.readUInt32BE(20);
      logoImageDecoded = true;
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
// url http(s) -> delega para o fetch nativo do bun.
const shimFetch = async (url: any, init?: any): Promise<any> => {
  if (typeof url === 'string' && !/^https?:/i.test(url)) {
    const p = url.startsWith('file://') ? new URL(url).pathname : url;
    const buf = fs.readFileSync(p);
    logoFileRead = true;
    return { blob: async () => new Blob([buf]) };
  }
  return nativeFetch(url, init);
};

(globalThis as any).FileReader = NodeFileReader;
(globalThis as any).Image = NodeImage;
(globalThis as any).fetch = shimFetch;

/* ------------------------------------------------------------------ */
/* Template REAL (verbatim) + jsPDF — importados DEPOIS dos shims       */
/* ------------------------------------------------------------------ */

const { default: jsPDF } = await import('jspdf');
const { renderTicketPage } = await import('@/utils/ticketPdfTemplate');

/* ------------------------------------------------------------------ */
/* Dados fake                                                          */
/* ------------------------------------------------------------------ */

const evento = {
  title: 'Festa Teste FestPag',
  date: '2026-08-15', // YYYY-MM-DD
  time: '22:00', // HH:MM
  venue: 'Espaço Aurora',
  city: 'São Paulo',
  state: 'SP',
};

const tickets = [
  {
    ticket_code: '11111111-1111-4111-8111-111111111111',
    lot_name: 'Cortesia Patrocinadores',
    holder_name: 'BARONI',
  },
  {
    ticket_code: '22222222-2222-4222-8222-222222222222',
    lot_name: 'Cortesia Patrocinadores',
    holder_name: 'BARONI',
  },
];

/* ------------------------------------------------------------------ */
/* Loop de render (sem pdf.save)                                       */
/* ------------------------------------------------------------------ */

const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
const issuedAt = new Date();

for (let i = 0; i < tickets.length; i++) {
  if (i > 0) pdf.addPage();
  const t = tickets[i];
  await renderTicketPage(pdf, {
    event: evento,
    lot: { name: t.lot_name },
    ticket: { ticket_code: t.ticket_code, holder_name: t.holder_name },
    issuedAt,
  });
}

const arrayBuffer = pdf.output('arraybuffer');
const outDir = path.resolve('cortesias-out');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'TESTE.pdf');
fs.writeFileSync(outPath, Buffer.from(arrayBuffer));

/* ------------------------------------------------------------------ */
/* Diagnóstico                                                         */
/* ------------------------------------------------------------------ */

const size = fs.statSync(outPath).size;
const logoOk = logoFileRead && logoImageDecoded;
console.log(`Gerado: ${outPath}`);
console.log(`Bytes:  ${size}`);
console.log(`Tickets: ${tickets.length}`);
console.log(
  logoOk
    ? 'Logo:   REAL embutido (loadLogo leu o PNG do disco e decodificou dimensões)'
    : 'Logo:   FALLBACK de texto "FESTPAG" (loadLogo falhou)',
);
