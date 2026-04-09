import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Ticket, User, LogOut, LayoutDashboard, Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const Header = () => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { user, profile, isProdutor, signOut, isLoading } = useAuth();

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
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Ticket className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-xl hidden sm:block text-foreground">
              Fest<span className="text-primary">Pag</span>
            </span>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Search Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSearchOpen(true)}
              className="text-muted-foreground hover:text-foreground"
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
                        <Button variant="ghost" className="flex items-center gap-2 px-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                              {profile?.nome_completo ? getInitials(profile.nome_completo) : 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="hidden md:block text-sm font-medium max-w-[100px] truncate">
                            {profile?.nome_completo?.split(' ')[0] || 'Usuário'}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <div className="px-3 py-2 border-b border-border">
                          <p className="font-medium text-sm">{profile?.nome_completo}</p>
                          <p className="text-xs text-muted-foreground">{profile?.email}</p>
                        </div>
                        
                        {isProdutor && (
                          <>
                            <DropdownMenuItem onClick={() => navigate('/produtor/dashboard')}>
                              <LayoutDashboard className="mr-2 h-4 w-4" />
                              Painel do Produtor
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate('/produtor/eventos')}>
                              <Calendar className="mr-2 h-4 w-4" />
                              Meus Eventos
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        
                        <DropdownMenuItem onClick={() => navigate('/meus-ingressos')}>
                          <Ticket className="mr-2 h-4 w-4" />
                          Meus Ingressos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate('/minha-conta')}>
                          <User className="mr-2 h-4 w-4" />
                          Minha Conta
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                          <LogOut className="mr-2 h-4 w-4" />
                          Sair
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : (
                  <>
                    {/* Login */}
                    <Button
                      variant="outline"
                      className="flex gap-2"
                      onClick={() => navigate('/login')}
                    >
                      <User className="w-4 h-4" />
                      <span>Entrar</span>
                    </Button>

                    {/* Área do Produtor */}
                    <Button
                      variant="gradient"
                      className="hidden md:flex"
                      onClick={() => navigate('/area-do-produtor')}
                    >
                      Área do Produtor
                    </Button>
                  </>
                )}
              </>
            )}

          </div>
        </div>
      </div>

      {/* Search Modal */}
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
                  placeholder="Buscar eventos, artistas, locais..."
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
