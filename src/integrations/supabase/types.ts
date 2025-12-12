export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      collaborator_credentials: {
        Row: {
          collaborator_id: string
          created_at: string | null
          id: string
          password_hash: string
          updated_at: string | null
        }
        Insert: {
          collaborator_id: string
          created_at?: string | null
          id?: string
          password_hash: string
          updated_at?: string | null
        }
        Update: {
          collaborator_id?: string
          created_at?: string | null
          id?: string
          password_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_credentials_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: true
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_events: {
        Row: {
          collaborator_id: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          collaborator_id: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          collaborator_id?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_events_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_sessions: {
        Row: {
          collaborator_id: string
          created_at: string
          expires_at: string
          id: string
          session_token_hash: string
        }
        Insert: {
          collaborator_id: string
          created_at?: string
          expires_at: string
          id?: string
          session_token_hash: string
        }
        Update: {
          collaborator_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_sessions_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: true
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          producer_id: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          producer_id: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          producer_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      email_verification_codes: {
        Row: {
          code: string
          cpf: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          name: string | null
          verified: boolean | null
        }
        Insert: {
          code: string
          cpf?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          name?: string | null
          verified?: boolean | null
        }
        Update: {
          code?: string
          cpf?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          name?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      event_lots: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          event_id: string
          fake_scarcity_enabled: boolean | null
          fake_scarcity_percentage: number | null
          id: string
          is_active: boolean | null
          name: string
          original_price: number | null
          price: number
          sold_quantity: number
          start_date: string | null
          total_quantity: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_id: string
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          original_price?: number | null
          price: number
          sold_quantity?: number
          start_date?: string | null
          total_quantity: number
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_id?: string
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          original_price?: number | null
          price?: number
          sold_quantity?: number
          start_date?: string | null
          total_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_lots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          category: string
          city: string
          created_at: string
          date: string
          description: string | null
          fake_scarcity_enabled: boolean | null
          fake_scarcity_percentage: number | null
          id: string
          image_url: string | null
          is_hot: boolean | null
          producer_id: string
          short_description: string | null
          state: string
          status: string
          time: string
          title: string
          updated_at: string
          venue: string
        }
        Insert: {
          address?: string | null
          category: string
          city: string
          created_at?: string
          date: string
          description?: string | null
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          image_url?: string | null
          is_hot?: boolean | null
          producer_id: string
          short_description?: string | null
          state: string
          status?: string
          time: string
          title: string
          updated_at?: string
          venue: string
        }
        Update: {
          address?: string | null
          category?: string
          city?: string
          created_at?: string
          date?: string
          description?: string | null
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          image_url?: string | null
          is_hot?: boolean | null
          producer_id?: string
          short_description?: string | null
          state?: string
          status?: string
          time?: string
          title?: string
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_list_entries: {
        Row: {
          added_by: string
          checked_in_at: string | null
          created_at: string
          guest_list_id: string
          id: string
          name: string
          status: string
        }
        Insert: {
          added_by?: string
          checked_in_at?: string | null
          created_at?: string
          guest_list_id: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          added_by?: string
          checked_in_at?: string | null
          created_at?: string
          guest_list_id?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_list_entries_guest_list_id_fkey"
            columns: ["guest_list_id"]
            isOneToOne: false
            referencedRelation: "guest_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_lists: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_active: boolean
          max_guests: number | null
          name: string
          public_slug: string
          updated_at: string
          valid_until_time: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_active?: boolean
          max_guests?: number | null
          name: string
          public_slug: string
          updated_at?: string
          valid_until_time: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_active?: boolean
          max_guests?: number | null
          name?: string
          public_slug?: string
          updated_at?: string
          valid_until_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          event_id: string
          id: string
          payment_method: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          event_id: string
          id?: string
          payment_method?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          event_id?: string
          id?: string
          payment_method?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_stripe_accounts: {
        Row: {
          created_at: string
          id: string
          onboarding_completed: boolean
          pin_hash: string | null
          stripe_account_id: string | null
          stripe_account_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          onboarding_completed?: boolean
          pin_hash?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          onboarding_completed?: boolean
          pin_hash?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cpf: string | null
          created_at: string | null
          email: string
          id: string
          nome_completo: string
          whatsapp: string
        }
        Insert: {
          avatar_url?: string | null
          cpf?: string | null
          created_at?: string | null
          email: string
          id: string
          nome_completo: string
          whatsapp: string
        }
        Update: {
          avatar_url?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string
          id?: string
          nome_completo?: string
          whatsapp?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          holder_email: string | null
          holder_name: string
          holder_phone: string | null
          id: string
          lot_id: string
          order_id: string
          status: string
          ticket_code: string
          user_id: string | null
          validated_at: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          holder_email?: string | null
          holder_name: string
          holder_phone?: string | null
          id?: string
          lot_id: string
          order_id: string
          status?: string
          ticket_code?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          holder_email?: string | null
          holder_name?: string
          holder_phone?: string | null
          id?: string
          lot_id?: string
          order_id?: string
          status?: string
          ticket_code?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "event_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "cliente" | "produtor" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["cliente", "produtor", "admin"],
    },
  },
} as const
