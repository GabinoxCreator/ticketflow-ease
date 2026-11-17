import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Proteção em volta das rotas (OS-435, 16/11/2026).
 *
 * Com as telas baixadas sob demanda (`src/lib/sobDemanda.ts`), uma tela pode falhar ao
 * baixar ou ao rodar o próprio arquivo. Sem esta proteção, o React desmonta o site
 * inteiro e a aba fica em branco, sem cabeçalho e sem o "voltar" do roteador. Com ela,
 * só o lugar daquela tela mostra o aviso abaixo (o fundo da página e o aviso de cookies
 * seguem), e ir para outro endereço tenta de novo. O aviso aparece em QUALQUER erro de
 * tela que caia nesta proteção (qualquer rota, inclusive a página do evento, sem
 * recarga nenhuma). No erro de baixar o arquivo de uma tela, só depois da recarga única
 * (`src/lib/sobDemanda.ts`).
 *
 * Texto aprovado pelo Gabriel na caixinha da Linha 3 em 16/11/2026 ("Frase + botão"):
 * não mudar sem ele. O botão recarrega a página. Visual igual ao das telas de "link
 * indisponível" do site (ícone de alerta, título e frase centralizados, botão do site).
 * O erro continua indo para o console, como antes.
 */
class Protecao extends Component<{ local: string; children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidUpdate(anterior: { local: string }) {
    // Mudou de endereço depois de um erro: tenta desenhar de novo.
    if (this.state.erro && anterior.local !== this.props.local) this.setState({ erro: false });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="font-display font-semibold text-xl">Não conseguimos abrir esta página.</h1>
          <p className="text-sm text-muted-foreground">Confira sua internet e tente de novo.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }
}

export function ProtecaoDasRotas({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Protecao local={pathname}>{children}</Protecao>;
}
