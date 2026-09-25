/*
 * O fundo do site — UM só, atrás da página inteira.
 *
 * Pedido do Gabriel em 24/09/2026: *"o gradiente do fundo eu tô sentindo que não
 * tá legal. Ele tem que ser um, por completo, uma coisa só, com algumas cores,
 * alguns movimentos, algumas coisas de tecnologia no fundo. Desse jeito tá
 * quebrado aqui, não fica muito bonito"*.
 *
 * Ele estava certo, e a causa era estrutural: cada bloco da home pintava o
 * PRÓPRIO fundo (o banner tinha três manchas, a vitrine tinha um banho roxo, o
 * body tinha um gradiente), e as emendas entre eles apareciam como faixas.
 *
 * A correção: um único elemento fixo atrás de tudo, e nenhum bloco pinta fundo
 * por conta própria. Como ele é `fixed`, a página rola por cima — o fundo não
 * se repete nem "anda" junto, que é o que mais denuncia emenda.
 *
 * O "ar de tecnologia" vem da malha de linhas finas, não de enfeite: ela dá a
 * leitura de grade/engenharia sem competir com a arte dos banners, que é o que
 * de fato vende.
 *
 * ⚠️ ELE NÃO USA CAMADA NEGATIVA, e isso é deliberado. Com `-z-10` o fundo fica
 * atrás da cor de `html`/`body` e some por completo — o navegador desenha o
 * fundo do documento na frente de qualquer coisa em camada negativa. Levou três
 * tentativas até medir isso no navegador (24/09/2026). Em vez disso: o fundo é
 * `z-0` e o conteúdo do app vai em `relative z-10`, no App.tsx. Quem mexer aqui:
 * se puser `-z-10` de volta, o fundo desaparece sem erro nenhum.
 */

export function FundoDaPagina() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background">
      {/* 1. Base: a rampa quente que tinge a página inteira. */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(233_100%_97%)] via-[hsl(230_40%_96%)] to-[hsl(322_100%_96%)]" />

      {/* 2. Manchas de cor da marca. Ficam DENTRO da tela: na primeira versão
           estavam nas bordas com blur de 120px e a cor morria antes de aparecer
           — a página lia como branco liso, que foi a reclamação do Gabriel.
           Respiram devagar (18s a 26s): lento o bastante para passar por "vivo"
           sem ninguém reparar no movimento. */}
      <div className="absolute left-[5%] top-[2%] h-[55vh] w-[55vh] animate-fundo-a rounded-full bg-primary/60 blur-[90px]" />
      <div className="absolute right-[4%] top-[14%] h-[48vh] w-[48vh] animate-fundo-b rounded-full bg-accent/50 blur-[90px]" />
      <div className="absolute bottom-[6%] left-[18%] h-[52vh] w-[52vh] animate-fundo-c rounded-full bg-[hsl(280_85%_66%)]/45 blur-[95px]" />
      <div className="absolute bottom-[22%] right-[12%] h-[40vh] w-[40vh] animate-fundo-a rounded-full bg-primary/40 blur-[90px]" />

      {/* 3. A malha: o "ar de tecnologia". Linhas de 1px a 4% de opacidade —
           some se você olhar de frente, e é o que dá a sensação de grade. */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      {/* 4. Só um véu leve, e SÓ para a malha não virar folha quadriculada.
           Era forte demais na primeira tentativa e apagava justamente as
           manchas de cor, que ficam nas bordas. */}
      <div className="absolute inset-0 bg-[radial-gradient(95%_85%_at_50%_30%,transparent_0%,hsl(var(--background)/0.25)_100%)]" />
    </div>
  );
}
