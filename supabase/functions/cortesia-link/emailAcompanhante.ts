// E-mail do acompanhante (OS-357): quem retirou o ingresso grátis apontou o CPF e o
// e-mail desta pessoa, e o ingresso dela já existe no CPF dela. O link leva à página de
// transferência de sempre, onde ela cria a conta e o ingresso passa para ela.
// Mesmo desenho dos e-mails de código (`_shared/emailCodigo.ts`).

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function assuntoAcompanhante(evento: string): string {
  return `Seu ingresso para ${evento} está esperando você`;
}

export function htmlAcompanhante(o: { nomeAcompanhante: string; quemRetirou: string; evento: string; url: string }): string {
  const nome = esc(o.nomeAcompanhante.trim().split(" ")[0] ?? "");
  const quem = esc(o.quemRetirou.trim().split(" ")[0] ?? "");
  const evento = esc(o.evento);
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="https://festpag.digital/logo-festpag.png" alt="FestPag" width="160" style="display:inline-block; max-width:160px; height:auto;" />
      </div>
      <h2 style="color: #1f2937;">Olá${nome ? `, ${nome}` : ""}!</h2>
      <p style="color: #4b5563; font-size: 18px;">${quem || "Uma pessoa"} retirou um ingresso para você no <strong>${evento}</strong>.</p>
      <p style="color: #4b5563; font-size: 18px;">Para receber o seu ingresso, é só fazer o seu cadastro na FestPag pelo botão abaixo.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${o.url}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-size: 18px; font-weight: bold;">
          Pegar meu ingresso
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px; word-break: break-all;">
        Se o botão não abrir, copie este endereço: ${o.url}
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        © ${new Date().getFullYear()} FestPag. Todos os direitos reservados.
      </p>
    </div>`;
}
