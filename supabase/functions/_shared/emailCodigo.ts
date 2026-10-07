/*
 * O e-mail com o código de login/cadastro e o e-mail com link (convite, troca).
 *
 * Mesmo desenho do `send-verification-code` (que continua existindo para o
 * checkout de hoje): caixa clara com borda roxa e o código em preto — nunca
 * texto claro sobre gradiente, que é o que sumiu com o código em 14/08/2026.
 */

const rodape = () => `
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
  <p style="color: #9ca3af; font-size: 12px; text-align: center;">
    © ${new Date().getFullYear()} FestPag. Todos os direitos reservados.
  </p>`;

const cabecalho = () => `
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://festpag.digital/logo-festpag.png" alt="FestPag" width="160" style="display:inline-block; max-width:160px; height:auto;" />
  </div>`;

export function assuntoCodigo(codigo: string): string {
  return `${codigo} é o seu código de acesso - FestPag`;
}

export function htmlCodigo(opts: { codigo: string; nome?: string | null; validadeMin?: number }): string {
  const nome = (opts.nome ?? '').trim().split(' ')[0];
  const validade = opts.validadeMin ?? 10;
  return `
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0;">
      Seu código FestPag: ${opts.codigo} (vale por ${validade} minutos)
    </div>
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      ${cabecalho()}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin: 0 0 30px 0;">
        <tr>
          <td align="center" bgcolor="#f5f3ff" style="background-color: #f5f3ff; border: 2px solid #7c3aed; border-radius: 12px; padding: 24px 16px;">
            <p style="margin: 0 0 10px 0; color: #6d28d9; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-family: Arial, sans-serif;">
              Seu código
            </p>
            <div style="font-size: 40px; font-weight: bold; letter-spacing: 8px; text-indent: 8px; color: #1f2937; font-family: Arial, sans-serif;">
              ${opts.codigo}
            </div>
          </td>
        </tr>
      </table>
      <h2 style="color: #1f2937;">Olá${nome ? `, ${nome}` : ''}!</h2>
      <p style="color: #4b5563; font-size: 18px;">
        Digite o código acima no site da FestPag para entrar.
      </p>
      <p style="color: #6b7280; font-size: 15px;">
        Ele vale por <strong>${validade} minutos</strong>. Ninguém da FestPag vai pedir esse código para você.
      </p>
      <p style="color: #6b7280; font-size: 15px;">
        Se não foi você que pediu, pode ignorar este e-mail.
      </p>
      ${rodape()}
    </div>`;
}

/*
 * PIN esquecido do painel do produtor (OS-166, 07/10/2026). Mesmo desenho do
 * código de acesso; o texto diz para que serve e o que fazer se não foi ele,
 * porque quem pede PIN novo sem ser o dono está mexendo na conta do repasse.
 */
export function assuntoCodigoPin(codigo: string): string {
  return `${codigo} é o código para criar um PIN novo - FestPag`;
}

export function htmlCodigoPin(opts: { codigo: string; nome?: string | null; validadeMin?: number }): string {
  const nome = (opts.nome ?? '').trim().split(' ')[0];
  const validade = opts.validadeMin ?? 10;
  return `
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;opacity:0;">
      Código para criar um PIN novo: ${opts.codigo} (vale por ${validade} minutos)
    </div>
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      ${cabecalho()}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; margin: 0 0 30px 0;">
        <tr>
          <td align="center" bgcolor="#f5f3ff" style="background-color: #f5f3ff; border: 2px solid #7c3aed; border-radius: 12px; padding: 24px 16px;">
            <p style="margin: 0 0 10px 0; color: #6d28d9; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-family: Arial, sans-serif;">
              Seu código
            </p>
            <div style="font-size: 40px; font-weight: bold; letter-spacing: 8px; text-indent: 8px; color: #1f2937; font-family: Arial, sans-serif;">
              ${opts.codigo}
            </div>
          </td>
        </tr>
      </table>
      <h2 style="color: #1f2937; font-family: Arial, sans-serif;">Olá${nome ? `, ${nome}` : ''}!</h2>
      <p style="color: #4b5563; font-size: 18px; font-family: Arial, sans-serif;">
        Você pediu para criar um PIN novo no painel do produtor da FestPag. Digite o código acima na tela do PIN.
      </p>
      <p style="color: #6b7280; font-size: 15px; font-family: Arial, sans-serif;">
        Ele vale por <strong>${validade} minutos</strong>. Ninguém da FestPag vai pedir esse código para você.
      </p>
      <p style="color: #6b7280; font-size: 15px; font-family: Arial, sans-serif;">
        Não foi você? Não passe este código para ninguém e troque a senha da sua conta. Alguém pode estar tentando mexer na conta que recebe os seus repasses. Se precisar, fale com a gente em suporte@festpag.digital.
      </p>
      ${rodape()}
    </div>`;
}

export function assuntoLink(tipo: string): string {
  switch (tipo) {
    case 'invite': return 'Você foi convidado para a FestPag';
    case 'recovery': return 'Redefinir a sua senha - FestPag';
    case 'email_change': return 'Confirme o seu novo e-mail - FestPag';
    default: return 'Confirme o seu acesso - FestPag';
  }
}

export function htmlLink(opts: { tipo: string; url: string; nome?: string | null }): string {
  const nome = (opts.nome ?? '').trim().split(' ')[0];
  const texto = opts.tipo === 'invite'
    ? 'Você foi convidado a acessar a FestPag. Clique no botão para criar a sua senha.'
    : opts.tipo === 'recovery'
      ? 'Clique no botão para redefinir a sua senha.'
      : 'Clique no botão para confirmar.';
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      ${cabecalho()}
      <h2 style="color: #1f2937;">Olá${nome ? `, ${nome}` : ''}!</h2>
      <p style="color: #4b5563; font-size: 18px;">${texto}</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${opts.url}" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-size: 18px; font-weight: bold;">
          Continuar
        </a>
      </p>
      <p style="color: #6b7280; font-size: 13px; word-break: break-all;">
        Se o botão não abrir, copie este endereço: ${opts.url}
      </p>
      ${rodape()}
    </div>`;
}
