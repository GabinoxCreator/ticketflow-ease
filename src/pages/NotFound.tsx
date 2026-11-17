import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';

/*
 * Página não encontrada (OS-410, 09/11/2026). Antes era uma tela solta, em
 * inglês ("Oops! Page not found"), sem cabeçalho nem rodapé: quem caía aqui
 * não tinha por onde voltar. Serve também ao endereço de produtora que não
 * existe (`ProdutorPublico` devolve esta página).
 *
 * Quem errou um endereço dentro de `/produtor` ganha também o caminho de volta
 * ao painel (item 2.2 da OS-408, feito aqui para as duas ordens não mexerem no
 * mesmo arquivo).
 */
const NotFound = () => {
  const location = useLocation();
  // Com a barra: `/produtora-que-nao-existe` é página pública, não é o painel.
  const noPainelDoProdutor = location.pathname.startsWith('/produtor/');

  useEffect(() => {
    console.error('404: endereço que não existe:', location.pathname);
  }, [location.pathname]);

  return (
    <>
      <Helmet>
        <title>Página não encontrada | FestPag</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 pt-28 pb-16">
          <div className="text-center max-w-md">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-3">
              Página não encontrada
            </h1>
            <p className="text-muted-foreground text-base md:text-lg mb-8">
              O endereço pode ter mudado ou o evento já passou.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/">Ver eventos</Link>
              </Button>
              {noPainelDoProdutor && (
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link to="/produtor/dashboard">Voltar ao painel</Link>
                </Button>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default NotFound;
