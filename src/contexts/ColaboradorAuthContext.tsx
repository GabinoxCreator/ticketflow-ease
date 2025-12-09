import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Collaborator {
  id: string;
  name: string;
  username: string;
  producer_id: string;
}

interface CollaboratorEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  city: string;
  state: string;
  image_url: string | null;
  status: string;
}

interface CollaboratorSession {
  token: string;
  expires_at: string;
}

interface ColaboradorAuthContextType {
  collaborator: Collaborator | null;
  events: CollaboratorEvent[];
  session: CollaboratorSession | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const ColaboradorAuthContext = createContext<ColaboradorAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'colaborador_session';

export function ColaboradorAuthProvider({ children }: { children: ReactNode }) {
  const [collaborator, setCollaborator] = useState<Collaborator | null>(null);
  const [events, setEvents] = useState<CollaboratorEvent[]>([]);
  const [session, setSession] = useState<CollaboratorSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        const expiresAt = new Date(data.session?.expires_at);
        if (expiresAt > new Date()) {
          setCollaborator(data.collaborator);
          setEvents(data.events || []);
          setSession(data.session);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collaborator-login`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ username, password }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Erro ao fazer login' };
      }

      setCollaborator(data.collaborator);
      setEvents(data.events || []);
      setSession(data.session);

      // Store session
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        collaborator: data.collaborator,
        events: data.events,
        session: data.session,
      }));

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Erro de conexão' };
    }
  };

  const logout = () => {
    setCollaborator(null);
    setEvents([]);
    setSession(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ColaboradorAuthContext.Provider
      value={{
        collaborator,
        events,
        session,
        isLoading,
        login,
        logout,
        isAuthenticated: !!collaborator && !!session,
      }}
    >
      {children}
    </ColaboradorAuthContext.Provider>
  );
}

export function useColaboradorAuth() {
  const context = useContext(ColaboradorAuthContext);
  if (context === undefined) {
    throw new Error('useColaboradorAuth must be used within a ColaboradorAuthProvider');
  }
  return context;
}
