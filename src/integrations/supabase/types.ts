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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      borrow_records: {
        Row: {
          borrowed_at: string
          component_id: string
          created_at: string
          damage_note: string | null
          damage_reported: boolean
          due_at: string
          extended_count: number
          id: string
          note: string | null
          quantity: number
          reminded_overdue_at: string | null
          reminded_soon_at: string | null
          returned_at: string | null
          user_id: string
        }
        Insert: {
          borrowed_at?: string
          component_id: string
          created_at?: string
          damage_note?: string | null
          damage_reported?: boolean
          due_at?: string
          extended_count?: number
          id?: string
          note?: string | null
          quantity?: number
          reminded_overdue_at?: string | null
          reminded_soon_at?: string | null
          returned_at?: string | null
          user_id: string
        }
        Update: {
          borrowed_at?: string
          component_id?: string
          created_at?: string
          damage_note?: string | null
          damage_reported?: boolean
          due_at?: string
          extended_count?: number
          id?: string
          note?: string | null
          quantity?: number
          reminded_overdue_at?: string | null
          reminded_soon_at?: string | null
          returned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "borrow_records_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      component_submissions: {
        Row: {
          bin_label: string | null
          category: string
          component_id: string | null
          created_at: string
          id: string
          name: string
          note: string | null
          quantity: number
          rack_id: string | null
          review_note: string | null
          reviewed_at: string | null
          specs: string | null
          status: string
          submitted_by: string
        }
        Insert: {
          bin_label?: string | null
          category?: string
          component_id?: string | null
          created_at?: string
          id?: string
          name: string
          note?: string | null
          quantity: number
          rack_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          specs?: string | null
          status?: string
          submitted_by: string
        }
        Update: {
          bin_label?: string | null
          category?: string
          component_id?: string | null
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          quantity?: number
          rack_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          specs?: string | null
          status?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_submissions_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_submissions_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "racks"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          bin_label: string | null
          borrowable: boolean
          category: string
          created_at: string
          id: string
          image_url: string | null
          keywords: string[]
          name: string
          qr_code: string | null
          quantity_available: number
          quantity_total: number
          rack_id: string | null
          specs: string | null
          updated_at: string
        }
        Insert: {
          bin_label?: string | null
          borrowable?: boolean
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          keywords?: string[]
          name: string
          qr_code?: string | null
          quantity_available?: number
          quantity_total?: number
          rack_id?: string | null
          specs?: string | null
          updated_at?: string
        }
        Update: {
          bin_label?: string | null
          borrowable?: boolean
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          keywords?: string[]
          name?: string
          qr_code?: string | null
          quantity_available?: number
          quantity_total?: number
          rack_id?: string | null
          specs?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_rack_id_fkey"
            columns: ["rack_id"]
            isOneToOne: false
            referencedRelation: "racks"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          borrow_record_id: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          borrow_record_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          borrow_record_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_borrow_record_id_fkey"
            columns: ["borrow_record_id"]
            isOneToOne: false
            referencedRelation: "borrow_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          roll_number: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          roll_number?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          roll_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      racks: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          location_note: string | null
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          location_note?: string | null
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          location_note?: string | null
          name?: string
        }
        Relationships: []
      }
      unknown_scans: {
        Row: {
          created_at: string
          guessed_category: string | null
          guessed_name: string
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_component_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          guessed_category?: string | null
          guessed_name: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_component_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          guessed_category?: string | null
          guessed_name?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_component_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unknown_scans_resolved_component_id_fkey"
            columns: ["resolved_component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      borrow_component: {
        Args: {
          _component_id: string
          _days?: number
          _note?: string
          _quantity: number
        }
        Returns: string
      }
      extend_borrow: {
        Args: { _days?: number; _record_id: string }
        Returns: string
      }
      generate_return_reminders: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      return_component: {
        Args: { _damage_note?: string; _damaged?: boolean; _record_id: string }
        Returns: undefined
      }
      submit_component: {
        Args: {
          _bin_label?: string
          _category?: string
          _name: string
          _note?: string
          _quantity: number
          _rack_id?: string
          _specs?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "member"
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
      app_role: ["admin", "member"],
    },
  },
} as const
