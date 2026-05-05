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
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      checkin_logs: {
        Row: {
          action: string
          collaborator_id: string | null
          created_at: string
          event_id: string
          guest_entry_id: string | null
          id: string
          operator_id: string | null
          source: string
          ticket_id: string | null
        }
        Insert: {
          action?: string
          collaborator_id?: string | null
          created_at?: string
          event_id: string
          guest_entry_id?: string | null
          id?: string
          operator_id?: string | null
          source?: string
          ticket_id?: string | null
        }
        Update: {
          action?: string
          collaborator_id?: string | null
          created_at?: string
          event_id?: string
          guest_entry_id?: string | null
          id?: string
          operator_id?: string | null
          source?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkin_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_logs_guest_entry_id_fkey"
            columns: ["guest_entry_id"]
            isOneToOne: false
            referencedRelation: "guest_list_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
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
      door_sales: {
        Row: {
          created_at: string
          event_id: string
          id: string
          lot_id: string
          notes: string | null
          operator_id: string
          payment_method: string
          quantity: number
          total_amount: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          lot_id: string
          notes?: string | null
          operator_id: string
          payment_method?: string
          quantity?: number
          total_amount: number
          unit_price: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          lot_id?: string
          notes?: string | null
          operator_id?: string
          payment_method?: string
          quantity?: number
          total_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "door_sales_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "door_sales_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "event_lots"
            referencedColumns: ["id"]
          },
        ]
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
      event_coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          event_id: string
          id: string
          is_active: boolean
          max_uses: number | null
          updated_at: string
          uses_count: number
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          event_id: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          uses_count?: number
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          event_id?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          uses_count?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_coupons_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_likes: {
        Row: {
          anonymous_id: string
          created_at: string | null
          event_id: string
          id: string
        }
        Insert: {
          anonymous_id: string
          created_at?: string | null
          event_id: string
          id?: string
        }
        Update: {
          anonymous_id?: string
          created_at?: string | null
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_lots: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          event_id: string
          fake_scarcity_enabled: boolean | null
          fake_scarcity_percentage: number | null
          group_ticket_enabled: boolean
          group_ticket_quantity: number
          id: string
          is_active: boolean | null
          name: string
          original_price: number | null
          price: number
          reserved_quantity: number
          sales_start_type: string
          sector_name: string
          sold_quantity: number
          start_date: string | null
          starts_after_lot_id: string | null
          total_quantity: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_id: string
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          group_ticket_enabled?: boolean
          group_ticket_quantity?: number
          id?: string
          is_active?: boolean | null
          name: string
          original_price?: number | null
          price: number
          reserved_quantity?: number
          sales_start_type?: string
          sector_name?: string
          sold_quantity?: number
          start_date?: string | null
          starts_after_lot_id?: string | null
          total_quantity: number
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_id?: string
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          group_ticket_enabled?: boolean
          group_ticket_quantity?: number
          id?: string
          is_active?: boolean | null
          name?: string
          original_price?: number | null
          price?: number
          reserved_quantity?: number
          sales_start_type?: string
          sector_name?: string
          sold_quantity?: number
          start_date?: string | null
          starts_after_lot_id?: string | null
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
          {
            foreignKeyName: "event_lots_starts_after_lot_id_fkey"
            columns: ["starts_after_lot_id"]
            isOneToOne: false
            referencedRelation: "event_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          category: string | null
          city: string
          created_at: string
          date: string
          description: string | null
          end_date: string | null
          end_time: string | null
          fake_scarcity_enabled: boolean | null
          fake_scarcity_percentage: number | null
          id: string
          image_url: string | null
          is_hot: boolean | null
          producer_id: string
          producer_profile_id: string | null
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
          category?: string | null
          city: string
          created_at?: string
          date: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          image_url?: string | null
          is_hot?: boolean | null
          producer_id: string
          producer_profile_id?: string | null
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
          category?: string | null
          city?: string
          created_at?: string
          date?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          image_url?: string | null
          is_hot?: boolean | null
          producer_id?: string
          producer_profile_id?: string | null
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
          {
            foreignKeyName: "events_producer_profile_id_fkey"
            columns: ["producer_profile_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
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
      mp_webhook_events: {
        Row: {
          id: string
          mp_payment_id: string
          mp_status: string
          order_id: string | null
          outcome: string
          payload: Json
          processed_at: string
          request_id: string | null
        }
        Insert: {
          id?: string
          mp_payment_id: string
          mp_status: string
          order_id?: string | null
          outcome: string
          payload: Json
          processed_at?: string
          request_id?: string | null
        }
        Update: {
          id?: string
          mp_payment_id?: string
          mp_status?: string
          order_id?: string | null
          outcome?: string
          payload?: Json
          processed_at?: string
          request_id?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          coupon_id: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          event_id: string
          expires_at: string | null
          id: string
          mp_payment_id: string | null
          payment_method: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          coupon_id?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          discount_amount?: number
          event_id: string
          expires_at?: string | null
          id?: string
          mp_payment_id?: string | null
          payment_method?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          coupon_id?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          event_id?: string
          expires_at?: string | null
          id?: string
          mp_payment_id?: string | null
          payment_method?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "event_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_codes: {
        Row: {
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          verified?: boolean
        }
        Relationships: []
      }
      payouts: {
        Row: {
          bank_account_snapshot: Json | null
          created_at: string
          created_by: string | null
          event_id: string | null
          gross_amount: number
          id: string
          net_amount: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          platform_fee: number
          producer_profile_id: string
          receipt_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bank_account_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          platform_fee?: number
          producer_profile_id: string
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bank_account_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          platform_fee?: number
          producer_profile_id?: string
          receipt_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_producer_profile_id_fkey"
            columns: ["producer_profile_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      producer_bank_accounts: {
        Row: {
          account_holder_name: string
          account_number: string
          account_type: string
          agency: string
          bank_name: string
          created_at: string | null
          id: string
          pix_key: string
          pix_key_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_holder_name?: string
          account_number?: string
          account_type?: string
          agency?: string
          bank_name?: string
          created_at?: string | null
          id?: string
          pix_key?: string
          pix_key_type?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_holder_name?: string
          account_number?: string
          account_type?: string
          agency?: string
          bank_name?: string
          created_at?: string | null
          id?: string
          pix_key?: string
          pix_key_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      producer_fee_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          fee_fixed: number
          fee_percent: number
          id: string
          notes: string | null
          producer_profile_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fee_fixed?: number
          fee_percent?: number
          id?: string
          notes?: string | null
          producer_profile_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fee_fixed?: number
          fee_percent?: number
          id?: string
          notes?: string | null
          producer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_fee_overrides_producer_profile_id_fkey"
            columns: ["producer_profile_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          producer_profile_id: string
          role: Database["public"]["Enums"]["producer_member_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          producer_profile_id: string
          role?: Database["public"]["Enums"]["producer_member_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          producer_profile_id?: string
          role?: Database["public"]["Enums"]["producer_member_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_members_producer_profile_id_fkey"
            columns: ["producer_profile_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          producer_profile_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          producer_profile_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          producer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_notes_producer_profile_id_fkey"
            columns: ["producer_profile_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_profiles: {
        Row: {
          admin_status: string
          brand_name: string
          created_at: string
          document: string | null
          email: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          owner_user_id: string
          phone: string | null
          platform_fee_percent: number
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_status?: string
          brand_name: string
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          owner_user_id: string
          phone?: string | null
          platform_fee_percent?: number
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_status?: string
          brand_name?: string
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          owner_user_id?: string
          phone?: string | null
          platform_fee_percent?: number
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      confirm_lot_sale: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
      decrement_sold_quantity_legacy: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_producer_admin: {
        Args: { _producer_profile_id: string; _user_id: string }
        Returns: boolean
      }
      is_producer_member: {
        Args: { _producer_profile_id: string; _user_id: string }
        Returns: boolean
      }
      release_lot_quantity: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
      reserve_lot_quantity: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "cliente" | "produtor" | "admin"
      producer_member_role: "owner" | "admin" | "manager" | "checkin" | "viewer"
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
      producer_member_role: ["owner", "admin", "manager", "checkin", "viewer"],
    },
  },
} as const
