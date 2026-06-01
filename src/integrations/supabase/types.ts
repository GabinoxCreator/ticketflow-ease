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
      admin_section_permissions: {
        Row: {
          created_at: string
          id: string
          section: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          section: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          section?: string
          user_id?: string
        }
        Relationships: []
      }
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
      auth_rate_limits: {
        Row: {
          attempts: number
          blocked_until: string | null
          bucket_key: string
          last_attempt_at: string
          window_start: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          bucket_key: string
          last_attempt_at?: string
          window_start?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          bucket_key?: string
          last_attempt_at?: string
          window_start?: string
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
      event_fee_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          fee_fixed: number
          fee_percent: number
          id: string
          notes: string | null
          payment_method: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          fee_fixed?: number
          fee_percent?: number
          id?: string
          notes?: string | null
          payment_method: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          fee_fixed?: number
          fee_percent?: number
          id?: string
          notes?: string | null
          payment_method?: string
          updated_at?: string
        }
        Relationships: []
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
          manually_sold_out: boolean
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
          manually_sold_out?: boolean
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
          manually_sold_out?: boolean
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
      event_seat_pricing: {
        Row: {
          created_at: string
          event_id: string
          global_base_multiplier: number | null
          notes: string | null
          seat_types_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          global_base_multiplier?: number | null
          notes?: string | null
          seat_types_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          global_base_multiplier?: number | null
          notes?: string | null
          seat_types_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_seat_pricing_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_seats: {
        Row: {
          base_capacity: number | null
          base_price: number | null
          code: string | null
          color: string | null
          created_at: string
          event_id: string
          extra_price: number | null
          height: number | null
          held_by_user_id: string | null
          hold_expires_at: string | null
          hold_token: string | null
          icon: string | null
          id: string
          label: string | null
          manual_close_reason: string | null
          manual_holder_name: string | null
          manual_holder_notes: string | null
          manual_holder_phone: string | null
          manually_closed_at: string | null
          manually_closed_by: string | null
          max_capacity: number | null
          order_id: string | null
          pending_order_id: string | null
          radius: number | null
          rotation: number
          seat_type_id: string | null
          seat_type_name: string | null
          shape: string | null
          sold_order_id: string | null
          status: string
          updated_at: string
          venue_seat_id: string | null
          width: number | null
          x: number | null
          y: number | null
        }
        Insert: {
          base_capacity?: number | null
          base_price?: number | null
          code?: string | null
          color?: string | null
          created_at?: string
          event_id: string
          extra_price?: number | null
          height?: number | null
          held_by_user_id?: string | null
          hold_expires_at?: string | null
          hold_token?: string | null
          icon?: string | null
          id?: string
          label?: string | null
          manual_close_reason?: string | null
          manual_holder_name?: string | null
          manual_holder_notes?: string | null
          manual_holder_phone?: string | null
          manually_closed_at?: string | null
          manually_closed_by?: string | null
          max_capacity?: number | null
          order_id?: string | null
          pending_order_id?: string | null
          radius?: number | null
          rotation?: number
          seat_type_id?: string | null
          seat_type_name?: string | null
          shape?: string | null
          sold_order_id?: string | null
          status?: string
          updated_at?: string
          venue_seat_id?: string | null
          width?: number | null
          x?: number | null
          y?: number | null
        }
        Update: {
          base_capacity?: number | null
          base_price?: number | null
          code?: string | null
          color?: string | null
          created_at?: string
          event_id?: string
          extra_price?: number | null
          height?: number | null
          held_by_user_id?: string | null
          hold_expires_at?: string | null
          hold_token?: string | null
          icon?: string | null
          id?: string
          label?: string | null
          manual_close_reason?: string | null
          manual_holder_name?: string | null
          manual_holder_notes?: string | null
          manual_holder_phone?: string | null
          manually_closed_at?: string | null
          manually_closed_by?: string | null
          max_capacity?: number | null
          order_id?: string | null
          pending_order_id?: string | null
          radius?: number | null
          rotation?: number
          seat_type_id?: string | null
          seat_type_name?: string | null
          shape?: string | null
          sold_order_id?: string | null
          status?: string
          updated_at?: string
          venue_seat_id?: string | null
          width?: number | null
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_seats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_seats_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_seats_seat_type_id_fkey"
            columns: ["seat_type_id"]
            isOneToOne: false
            referencedRelation: "seat_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_seats_venue_seat_id_fkey"
            columns: ["venue_seat_id"]
            isOneToOne: false
            referencedRelation: "venue_seats"
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
          event_type: string
          fake_scarcity_enabled: boolean | null
          fake_scarcity_percentage: number | null
          id: string
          image_url: string | null
          is_hot: boolean | null
          map_snapshot: Json | null
          map_snapshot_at: string | null
          mesa_reserva_description: string | null
          producer_id: string
          producer_profile_id: string | null
          short_description: string | null
          slug: string | null
          state: string
          status: string
          table_map_id: string | null
          time: string
          title: string
          updated_at: string
          venue: string
          venue_id: string | null
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
          event_type?: string
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          image_url?: string | null
          is_hot?: boolean | null
          map_snapshot?: Json | null
          map_snapshot_at?: string | null
          mesa_reserva_description?: string | null
          producer_id: string
          producer_profile_id?: string | null
          short_description?: string | null
          slug?: string | null
          state: string
          status?: string
          table_map_id?: string | null
          time: string
          title: string
          updated_at?: string
          venue: string
          venue_id?: string | null
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
          event_type?: string
          fake_scarcity_enabled?: boolean | null
          fake_scarcity_percentage?: number | null
          id?: string
          image_url?: string | null
          is_hot?: boolean | null
          map_snapshot?: Json | null
          map_snapshot_at?: string | null
          mesa_reserva_description?: string | null
          producer_id?: string
          producer_profile_id?: string | null
          short_description?: string | null
          slug?: string | null
          state?: string
          status?: string
          table_map_id?: string | null
          time?: string
          title?: string
          updated_at?: string
          venue?: string
          venue_id?: string | null
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
          {
            foreignKeyName: "events_table_map_id_fkey"
            columns: ["table_map_id"]
            isOneToOne: false
            referencedRelation: "table_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
      health_alert_throttle: {
        Row: {
          alert_key: string
          id: string
          last_sent_at: string
        }
        Insert: {
          alert_key: string
          id?: string
          last_sent_at?: string
        }
        Update: {
          alert_key?: string
          id?: string
          last_sent_at?: string
        }
        Relationships: []
      }
      map_objects: {
        Row: {
          created_at: string
          fill_color: string | null
          font_size: number | null
          height: number | null
          icon_name: string | null
          id: string
          image_url: string | null
          is_active: boolean
          object_type: string
          rotation: number
          stroke_color: string | null
          stroke_width: number | null
          table_map_id: string
          text_content: string | null
          width: number | null
          x: number
          y: number
          z_index: number
        }
        Insert: {
          created_at?: string
          fill_color?: string | null
          font_size?: number | null
          height?: number | null
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          object_type: string
          rotation?: number
          stroke_color?: string | null
          stroke_width?: number | null
          table_map_id: string
          text_content?: string | null
          width?: number | null
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          created_at?: string
          fill_color?: string | null
          font_size?: number | null
          height?: number | null
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          object_type?: string
          rotation?: number
          stroke_color?: string | null
          stroke_width?: number | null
          table_map_id?: string
          text_content?: string | null
          width?: number | null
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_objects_table_map_id_fkey"
            columns: ["table_map_id"]
            isOneToOne: false
            referencedRelation: "table_maps"
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
      order_email_notifications: {
        Row: {
          attempt_count: number
          claimed_at: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          kind: string
          order_id: string
          recipient_email: string | null
          resend_email_id: string | null
          sent_at: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claimed_at: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          kind?: string
          order_id: string
          recipient_email?: string | null
          resend_email_id?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claimed_at?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          kind?: string
          order_id?: string
          recipient_email?: string | null
          resend_email_id?: string | null
          sent_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          coupon_id: string | null
          created_at: string
          customer_cpf: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          event_id: string
          expires_at: string | null
          id: string
          manual_fee_applied: boolean
          manual_payment_method: string | null
          manual_payment_note: string | null
          manual_sold_by: string | null
          mp_payment_id: string | null
          mp_status_detail: string | null
          payment_method: string | null
          review_flagged_at: string | null
          review_reason: Json | null
          review_status: string | null
          sale_origin: string
          service_fee_amount: number
          status: string
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          coupon_id?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          discount_amount?: number
          event_id: string
          expires_at?: string | null
          id?: string
          manual_fee_applied?: boolean
          manual_payment_method?: string | null
          manual_payment_note?: string | null
          manual_sold_by?: string | null
          mp_payment_id?: string | null
          mp_status_detail?: string | null
          payment_method?: string | null
          review_flagged_at?: string | null
          review_reason?: Json | null
          review_status?: string | null
          sale_origin?: string
          service_fee_amount?: number
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          coupon_id?: string | null
          created_at?: string
          customer_cpf?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          event_id?: string
          expires_at?: string | null
          id?: string
          manual_fee_applied?: boolean
          manual_payment_method?: string | null
          manual_payment_note?: string | null
          manual_sold_by?: string | null
          mp_payment_id?: string | null
          mp_status_detail?: string | null
          payment_method?: string | null
          review_flagged_at?: string | null
          review_reason?: Json | null
          review_status?: string | null
          sale_origin?: string
          service_fee_amount?: number
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
          meta_pixel_id: string | null
          owner_user_id: string
          phone: string | null
          platform_fee_percent: number
          slug: string | null
          status: string
          tracking_enabled: boolean
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
          meta_pixel_id?: string | null
          owner_user_id: string
          phone?: string | null
          platform_fee_percent?: number
          slug?: string | null
          status?: string
          tracking_enabled?: boolean
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
          meta_pixel_id?: string | null
          owner_user_id?: string
          phone?: string | null
          platform_fee_percent?: number
          slug?: string | null
          status?: string
          tracking_enabled?: boolean
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
      seat_types: {
        Row: {
          base_capacity: number
          base_price: number
          created_at: string
          default_color: string | null
          default_height: number
          default_width: number
          description: string | null
          extra_price: number
          icon: string | null
          id: string
          is_active: boolean
          max_capacity: number
          name: string
          producer_id: string
          shape: string
          updated_at: string
        }
        Insert: {
          base_capacity: number
          base_price?: number
          created_at?: string
          default_color?: string | null
          default_height?: number
          default_width?: number
          description?: string | null
          extra_price?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          max_capacity: number
          name: string
          producer_id: string
          shape?: string
          updated_at?: string
        }
        Update: {
          base_capacity?: number
          base_price?: number
          created_at?: string
          default_color?: string | null
          default_height?: number
          default_width?: number
          description?: string | null
          extra_price?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          max_capacity?: number
          name?: string
          producer_id?: string
          shape?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_types_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_snapshots: {
        Row: {
          captured_at: string
          duration_ms: number | null
          id: string
          metrics: Json
          overall_severity: string
        }
        Insert: {
          captured_at?: string
          duration_ms?: number | null
          id?: string
          metrics?: Json
          overall_severity: string
        }
        Update: {
          captured_at?: string
          duration_ms?: number | null
          id?: string
          metrics?: Json
          overall_severity?: string
        }
        Relationships: []
      }
      table_maps: {
        Row: {
          background_color: string | null
          background_image_url: string | null
          canvas_height: number
          canvas_width: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          orientation: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          background_color?: string | null
          background_image_url?: string | null
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          orientation?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          background_color?: string | null
          background_image_url?: string | null
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          orientation?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_maps_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          event_id: string
          event_seat_id: string | null
          holder_email: string | null
          holder_name: string
          holder_phone: string | null
          id: string
          lot_id: string | null
          order_id: string
          seat_label: string | null
          status: string
          ticket_code: string
          user_id: string | null
          validated_at: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          event_seat_id?: string | null
          holder_email?: string | null
          holder_name: string
          holder_phone?: string | null
          id?: string
          lot_id?: string | null
          order_id: string
          seat_label?: string | null
          status?: string
          ticket_code?: string
          user_id?: string | null
          validated_at?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          event_seat_id?: string | null
          holder_email?: string | null
          holder_name?: string
          holder_phone?: string | null
          id?: string
          lot_id?: string | null
          order_id?: string
          seat_label?: string | null
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
            foreignKeyName: "tickets_event_seat_id_fkey"
            columns: ["event_seat_id"]
            isOneToOne: false
            referencedRelation: "event_seats"
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
      venue_seats: {
        Row: {
          code: string
          created_at: string
          custom_base_capacity: number | null
          custom_base_price: number | null
          custom_extra_price: number | null
          custom_max_capacity: number | null
          height: number | null
          id: string
          is_active: boolean
          label: string | null
          radius: number | null
          rotation: number
          seat_type_id: string
          table_map_id: string | null
          updated_at: string
          venue_id: string
          width: number | null
          x: number
          y: number
        }
        Insert: {
          code: string
          created_at?: string
          custom_base_capacity?: number | null
          custom_base_price?: number | null
          custom_extra_price?: number | null
          custom_max_capacity?: number | null
          height?: number | null
          id?: string
          is_active?: boolean
          label?: string | null
          radius?: number | null
          rotation?: number
          seat_type_id: string
          table_map_id?: string | null
          updated_at?: string
          venue_id: string
          width?: number | null
          x?: number
          y?: number
        }
        Update: {
          code?: string
          created_at?: string
          custom_base_capacity?: number | null
          custom_base_price?: number | null
          custom_extra_price?: number | null
          custom_max_capacity?: number | null
          height?: number | null
          id?: string
          is_active?: boolean
          label?: string | null
          radius?: number | null
          rotation?: number
          seat_type_id?: string
          table_map_id?: string | null
          updated_at?: string
          venue_id?: string
          width?: number | null
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_venue_seats_table_map"
            columns: ["table_map_id"]
            isOneToOne: false
            referencedRelation: "table_maps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_seats_seat_type_id_fkey"
            columns: ["seat_type_id"]
            isOneToOne: false
            referencedRelation: "seat_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_seats_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          producer_id: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          producer_id: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          producer_id?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_order_approved: {
        Args: { _mp_payment_id: string; _order_id: string }
        Returns: Json
      }
      cancel_manual_order: {
        Args: { _actor: string; _order_id: string; _reason: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          _block_seconds: number
          _bucket: string
          _max: number
          _window_seconds: number
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      confirm_lot_sale: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
      confirm_seats: {
        Args: { _event_id: string; _hold_token: string; _seat_ids: string[] }
        Returns: Json
      }
      create_seat_order: {
        Args: {
          _customer_cpf: string
          _customer_email: string
          _customer_name: string
          _customer_phone: string
          _event_id: string
          _fee_fixed: number
          _fee_percent: number
          _hold_token: string
          _payment_method: string
          _seats: Json
          _user_id: string
          _window?: string
        }
        Returns: Json
      }
      decrement_sold_quantity_legacy: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
      flag_order_paid_no_delivery: {
        Args: {
          _mp_payment_id: string
          _order_id: string
          _order_status: string
          _transaction_amount: number
        }
        Returns: boolean
      }
      get_cron_health: { Args: never; Returns: Json }
      get_cron_secret: { Args: never; Returns: string }
      get_event_fee: {
        Args: { _event_id: string; _method: string }
        Returns: {
          fee_fixed: number
          fee_percent: number
        }[]
      }
      has_manage_team: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hold_seats: {
        Args: { _event_id: string; _seat_ids: string[]; _window?: string }
        Returns: Json
      }
      is_event_checkin_open: {
        Args: { _event_id: string }
        Returns: {
          ends_at: string
          is_open: boolean
          reason: string
          starts_at: string
        }[]
      }
      is_producer_admin: {
        Args: { _producer_profile_id: string; _user_id: string }
        Returns: boolean
      }
      is_producer_member: {
        Args: { _producer_profile_id: string; _user_id: string }
        Returns: boolean
      }
      lookup_customer_by_cpf: {
        Args: { _cpf: string; _event_id: string }
        Returns: {
          email: string
          name: string
          source: string
          whatsapp: string
        }[]
      }
      publish_event_with_snapshot: {
        Args: { _event_id: string }
        Returns: Json
      }
      release_lot_quantity: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
      release_seats: {
        Args: { _event_id: string; _hold_token: string }
        Returns: Json
      }
      release_seats_admin: {
        Args: { _event_id: string; _hold_token: string; _user_id: string }
        Returns: Json
      }
      release_seats_for_order: { Args: { _order_id: string }; Returns: number }
      reserve_lot_quantity: {
        Args: { _lot_id: string; _qty: number }
        Returns: boolean
      }
      slugify: { Args: { _input: string }; Returns: string }
      sweep_expired_event_seat_holds: { Args: never; Returns: number }
      unaccent: { Args: { "": string }; Returns: string }
      unpublish_event: { Args: { _event_id: string }; Returns: Json }
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
