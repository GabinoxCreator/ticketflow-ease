// E-mail do convidado do pedido (OS-372): quem comprou apontou o nome, o CPF e o e-mail desta
// pessoa para um dos ingressos. O link leva à página de transferência de sempre, onde ela cria
// a conta (ou entra), confirma o CPF e o ingresso passa para ela.
// Mesmo desenho do e-mail do acompanhante (`cortesia-link/emailAcompanhante.ts`).
//
// ⚠️ A facial é OPCIONAL aqui (parecer do advogado, 02/10): o texto diz que dá para entrar pelo
// QR. Não escrever que a facial "libera a entrada" como no acompanhante, que é outro caso.

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const primeiro = (nome: string | null | undefined) => (nome ?? "").trim().split(/\s+/)[0] ?? "";

export function assuntoConvidado(o: { quemComprou: string; evento: string }): string {
  const quem = primeiro(o.quemComprou);
  return quem ? `${quem} separou um ingresso para você: ${o.evento}` : `Um ingresso para você: ${o.evento}`;
}

/** Até quando o link vale, do jeito que a pessoa lê: "22/11". */
export function diaDoPrazo(expiraEm: string): string {
  return new Date(expiraEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function htmlConvidado(o: {
  nomeConvidado: string; quemComprou: string; evento: string; dataEvento: string | null; url: string; expiraEm: string;
}): string {
  const nome = esc(primeiro(o.nomeConvidado));
  const quem = esc(primeiro(o.quemComprou)) || "Uma pessoa";
  const evento = esc(o.evento);
  const data = o.dataEvento ? ` (${esc(o.dataEvento)})` : "";
  const prazo = esc(diaDoPrazo(o.expiraEm));
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="https://festpag.digital/logo-festpag.png" alt="FestPag" width="160" style="display:inline-block; max-width:160px; height:auto;" />
      </div>
      <h2 style="color: #1f2937;">Olá${nome ? `, ${nome}` : ""}!</h2>
      <p style="color: #4b5563; font-size: 18px;">${quem} comprou um ingresso para você no <strong>${evento}</strong>${data}.</p>
      <p style="color: #4b5563; font-size: 18px;">Para ficar com ele, toque no botão, crie a sua conta na FestPag (ou entre, se já tiver) e confirme o seu CPF. O ingresso passa para o seu nome.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${o.url}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-size: 18px; font-weight: bold;">
          Pegar meu ingresso
        </a>
      </p>
      <p style="color: #4b5563; font-size: 16px;">Se quiser, cadastre também a sua facial: a entrada fica mais rápida. A facial é opcional; sem ela, você entra pelo QR do ingresso.</p>
      <p style="color: #6b7280; font-size: 14px;">O link vale até ${prazo}. Até você aceitar, o ingresso continua com ${quem}.</p>
      <p style="color: #6b7280; font-size: 13px; word-break: break-all;">
        Se o botão não abrir, copie este endereço: ${o.url}
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        © ${new Date().getFullYear()} FestPag. Todos os direitos reservados.
      </p>
    </div>`;
}
