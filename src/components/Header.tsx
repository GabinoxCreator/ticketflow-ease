import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, User, LogOut, LayoutDashboard, Calendar, ChevronDown, ChevronRight, Ticket, ArrowUpRight, Sparkles, Wallet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { openFestpayWallet, WALLET_ENABLED } from '@/lib/festpay';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import logoFestpag from '@/assets/logo-festpag.png';

const Header = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openingWallet, setOpeningWallet] = useState(false);
  const navigate = useNavigate();
  const { user, profile, isProdutor, signOut, isLoading } = useAuth();

  // Federação FestPag -> FestPay: emite o link_token e redireciona na MESMA aba pra
  // /vincular do FestPay (com return url). Lógica no helper compartilhado openFestpayWallet.
  const handleOpenWallet = async () => {
    if (openingWallet) return;
    setOpeningWallet(true);
    try {
      // sucesso: navega pra fora (não reseta o loading — a página está saindo)
      // só entrar (sem return/kyc=1): usuário verificado fica na carteira, não volta pro Ingressos
      await openFestpayWallet({ activate: false });
    } catch (err) {
      console.error('Erro ao abrir carteira:', err);
      toast.error('Não foi possível abrir sua carteira. Tente de novo.');
      setOpeningWallet(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery)}`);
      setIsSearchOpen(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20 gap-4">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <img src={logoFestpag} alt="FestPag" className="h-[70px] md:h-[84px] w-auto" />
          </Link>

          {/* Search Bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-xl mx-4">
            <form onSubmit={handleSearch} className="w-full relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Procure um evento, artista, produtor ou cidade"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-secondary border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
              />
            </form>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Search Button - Mobile */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(true)}
              className="md:hidden text-muted-foreground hover:text-foreground"
            >
              <Search className="w-5 h-5" />
            </Button>

            {!isLoading && (
              <>
                {user ? (
                  <>
                    {/* Meus Ingressos */}
                    <Button
                      variant="ghost"
                      className="hidden md:flex gap-2"
                      onClick={() => navigate('/meus-ingressos')}
                    >
                      <Ticket className="w-4 h-4" />
                      <span className="text-sm">Meus Ingressos</span>
                    </Button>

                    {/* User Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="flex items-center gap-2 px-2 group">
                          <div className="relative">
                            <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary to-pink-500 opacity-80 blur-[1px]" />
                            <Avatar className="h-9 w-9 relative ring-2 ring-background">
                              <AvatarFallback className="bg-gradient-to-br from-primary to-pink-500 text-primary-foreground text-xs font-semibold">
                                {profile?.nome_completo ? getInitials(profile.nome_completo) : 'U'}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="hidden md:block text-sm font-medium max-w-[100px] truncate">
                            {profile?.nome_completo?.split(' ')[0] || 'Usuário'}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        sideOffset={12}
                        className="w-[calc(100vw-2rem)] max-w-[320px] sm:w-72 p-0 overflow-hidden border-border/50 shadow-2xl shadow-primary/10 bg-popover/95 backdrop-blur-xl"
                      >
                        {/* Header com gradiente e dados do usuário */}
                        <div className="relative px-4 pt-4 pb-3 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-b border-border/50">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.18),_transparent_60%)] pointer-events-none" />
                          <div className="relative flex items-start gap-3">
                            <div className="relative flex-shrink-0">
                              <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary to-pink-500 opacity-90 blur-[2px]" />
                              <Avatar className="h-12 w-12 relative ring-2 ring-background">
                                <AvatarFallback className="bg-gradient-to-br from-primary to-pink-500 text-primary-foreground text-sm font-bold">
                                  {profile?.nome_completo ? getInitials(profile.nome_completo) : 'U'}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <p className="font-semibold text-sm leading-tight truncate">
                                {profile?.nome_completo || 'Usuário'}
                              </p>
                              <p
                                className="text-xs text-muted-foreground truncate mt-0.5"
                                title={profile?.email}
                              >
                                {profile?.email}
                              </p>
                              <Badge
                                variant="secondary"
                                className="mt-2 h-5 px-2 text-[10px] font-medium bg-primary/15 text-primary hover:bg-primary/20 border-0 gap-1"
                              >
                                <Sparkles className="h-2.5 w-2.5" />
                                {isProdutor ? 'Produtor' : 'Cliente'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Seção: Painel (apenas produtor) */}
                        {isProdutor && (
                          <DropdownMenuGroup className="p-2">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5">
                              Painel
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => navigate('/produtor/dashboard')}
                              className="group/item gap-3 py-2.5 px-2 rounded-lg cursor-pointer focus:bg-primary/10 focus:text-foreground"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 group-focus/item:bg-primary/20 transition-colors">
                                <LayoutDashboard className="h-4 w-4 text-foreground/80" />
                              </div>
                              <span className="flex-1 text-sm font-medium">Painel do Produtor</span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-focus/item:opacity-100 transition-opacity" />
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => navigate('/produtor/eventos')}
                              className="group/item gap-3 py-2.5 px-2 rounded-lg cursor-pointer focus:bg-primary/10 focus:text-foreground"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 group-focus/item:bg-primary/20 transition-colors">
                                <Calendar className="h-4 w-4 text-foreground/80" />
                              </div>
                              <span className="flex-1 text-sm font-medium">Meus Eventos</span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-focus/item:opacity-100 transition-opacity" />
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        )}

                        {isProdutor && <DropdownMenuSeparator className="my-0" />}

                        {/* Seção: Conta */}
                        <DropdownMenuGroup className="p-2">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5">
                            Conta
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => navigate('/meus-ingressos')}
                            className="group/item gap-3 py-2.5 px-2 rounded-lg cursor-pointer focus:bg-primary/10 focus:text-foreground"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 group-focus/item:bg-primary/20 transition-colors">
                              <Ticket className="h-4 w-4 text-foreground/80" />
                            </div>
                            <span className="flex-1 text-sm font-medium">Meus Ingressos</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-focus/item:opacity-100 transition-opacity" />
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => navigate('/minha-conta')}
                            className="group/item gap-3 py-2.5 px-2 rounded-lg cursor-pointer focus:bg-primary/10 focus:text-foreground"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 group-focus/item:bg-primary/20 transition-colors">
                              <User className="h-4 w-4 text-foreground/80" />
                            </div>
                            <span className="flex-1 text-sm font-medium">Minha Conta</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-focus/item:opacity-100 transition-opacity" />
                          </DropdownMenuItem>
                          {/* Federação FestPay: onSelect + preventDefault mantém o menu aberto
                              durante o loading; o handler redireciona pra carteira ao concluir.
                              Escondido quando a carteira está desativada (WALLET_ENABLED=false). */}
                          {WALLET_ENABLED && (
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                handleOpenWallet();
                              }}
                              disabled={openingWallet}
                              className="group/item gap-3 py-2.5 px-2 rounded-lg cursor-pointer focus:bg-primary/10 focus:text-foreground"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 group-focus/item:bg-primary/20 transition-colors">
                                {openingWallet ? (
                                  <Loader2 className="h-4 w-4 text-foreground/80 animate-spin" />
                                ) : (
                                  <Wallet className="h-4 w-4 text-foreground/80" />
                                )}
                              </div>
                              <span className="flex-1 text-sm font-medium">
                                {openingWallet ? 'Abrindo carteira…' : 'Minha Carteira'}
                              </span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-focus/item:opacity-100 transition-opacity" />
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuGroup>

                        {/* Botão Sair destacado */}
                        <div className="p-2 pt-0">
                          <button
                            onClick={handleSignOut}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 hover:border-destructive/30 text-sm font-medium transition-colors"
                          >
                            <LogOut className="h-4 w-4" />
                            Sair da conta
                          </button>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <>
                    {/* Sou Produtor */}
                    <button
                      onClick={() => navigate('/area-do-produtor')}
                      className="hidden md:flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Sou Produtor
                      <ArrowUpRight className="w-4 h-4" />
                    </button>

                    {/* Entrar / Cadastrar */}
                    <Button
                      variant="outline"
                      className="flex gap-2"
                      onClick={() => navigate('/login')}
                    >
                      <User className="w-4 h-4" />
                      <span>Entrar / Cadastrar</span>
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search Modal - Mobile */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/98 backdrop-blur-xl z-50 flex items-start justify-center pt-20 px-4"
            onClick={() => setIsSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Procure um evento, artista, produtor ou cidade"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-16 pl-14 pr-4 bg-card border border-border rounded-2xl text-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </form>
              <p className="text-muted-foreground text-sm mt-4 text-center">
                Pressione Enter para buscar ou ESC para fechar
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
