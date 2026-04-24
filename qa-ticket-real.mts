// Reusa o ticketPdf real do projeto (compilado on-the-fly via tsx)
import { generateTicketPDF } from './src/utils/ticketPdf.ts';
import { writeFileSync } from 'fs';

// Mock do jsPDF.save para escrever em arquivo local
const orig = (await import('jspdf')).jsPDF.prototype.save;
(await import('jspdf')).jsPDF.prototype.save = function (filename) {
  const buf = Buffer.from(this.output('arraybuffer'));
  writeFileSync(`/tmp/${filename}`, buf);
  console.log(`Saved /tmp/${filename}`);
};

const tickets = [
  {
    id: '1',
    ticket_code: '3241bbc3-aaaa-bbbb-cccc-dddddddddddd',
    holder_name: 'Gabriel Fernandes da Silva Junior',
    holder_email: 'gabriel.fernandes@email.com',
    holder_phone: '(17) 99999-1234',
    status: 'valid',
    validated_at: null,
    created_at: '2026-04-10T14:32:00Z',
    event: {
      id: 'e1',
      title: 'Samba do Brasileiro — Especial Feriado',
      date: '2026-04-18',
      time: '18:00:00',
      venue: 'Made in Brazil Bar',
      city: 'São José do Rio Preto',
      state: 'SP',
      image_url: null,
    },
    lot: { name: '2º Lote — Pista', price: 80 },
  },
  {
    id: '2',
    ticket_code: '779655e6-aaaa-bbbb-cccc-dddddddddddd',
    holder_name: 'Maria Oliveira',
    holder_email: 'maria@email.com',
    holder_phone: '(11) 98765-4321',
    status: 'used',
    validated_at: '2026-03-08T19:45:00Z',
    created_at: '2026-02-20T10:15:00Z',
    event: {
      id: 'e2',
      title: 'O Povo Pede Samba',
      date: '2026-03-08',
      time: '18:00:00',
      venue: 'Espaço Cultural Vila Madalena',
      city: 'São Paulo',
      state: 'SP',
      image_url: null,
    },
    lot: { name: 'Ingresso Antecipado', price: 60 },
  },
];

for (const t of tickets) {
  await generateTicketPDF(t);
}
