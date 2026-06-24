import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Client público SEM sessão — só pra LEITURAS de dados públicos (events, event_lots,
// event_seats, event_fee_overrides). Não persiste sessão nem faz refresh de token,
// então a query pública nunca espera o gate de auth do supabase-js.
// NUNCA usar pra dado privado (orders, tickets, profiles) — sem sessão, RLS por
// auth.uid() retorna vazio.
export const supabasePublic = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
