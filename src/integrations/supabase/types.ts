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
      export_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          output_url: string | null
          progress: number
          project_id: string
          quality: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          output_url?: string | null
          progress?: number
          project_id: string
          quality?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          output_url?: string | null
          progress?: number
          project_id?: string
          quality?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          captions_enabled: boolean
          clean_audio: boolean
          created_at: string
          duration: number | null
          error_message: string | null
          export_quality: string
          format: string
          id: string
          music_url: string | null
          music_volume: number
          status: Database["public"]["Enums"]["project_status"]
          style: string
          subtitle_position: string
          subtitle_y: number
          thumbnail_url: string | null
          title: string
          title_suggestion: string | null
          trim_end: number | null
          trim_start: number | null
          updated_at: string
          user_id: string
          video_path: string | null
          video_url: string | null
          viral_score: number | null
        }
        Insert: {
          captions_enabled?: boolean
          clean_audio?: boolean
          created_at?: string
          duration?: number | null
          error_message?: string | null
          export_quality?: string
          format?: string
          id?: string
          music_url?: string | null
          music_volume?: number
          status?: Database["public"]["Enums"]["project_status"]
          style?: string
          subtitle_position?: string
          subtitle_y?: number
          thumbnail_url?: string | null
          title?: string
          title_suggestion?: string | null
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string
          user_id: string
          video_path?: string | null
          video_url?: string | null
          viral_score?: number | null
        }
        Update: {
          captions_enabled?: boolean
          clean_audio?: boolean
          created_at?: string
          duration?: number | null
          error_message?: string | null
          export_quality?: string
          format?: string
          id?: string
          music_url?: string | null
          music_volume?: number
          status?: Database["public"]["Enums"]["project_status"]
          style?: string
          subtitle_position?: string
          subtitle_y?: number
          thumbnail_url?: string | null
          title?: string
          title_suggestion?: string | null
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string
          user_id?: string
          video_path?: string | null
          video_url?: string | null
          viral_score?: number | null
        }
        Relationships: []
      }
      scenes: {
        Row: {
          broll_meta: Json | null
          broll_url: string | null
          created_at: string
          end_time: number
          highlight_words: Json
          id: string
          is_hook: boolean
          order_index: number
          project_id: string
          start_time: number
          text: string
          top_video_url: string | null
          user_id: string
          zoom: string
        }
        Insert: {
          broll_meta?: Json | null
          broll_url?: string | null
          created_at?: string
          end_time: number
          highlight_words?: Json
          id?: string
          is_hook?: boolean
          order_index?: number
          project_id: string
          start_time: number
          text?: string
          top_video_url?: string | null
          user_id: string
          zoom?: string
        }
        Update: {
          broll_meta?: Json | null
          broll_url?: string | null
          created_at?: string
          end_time?: number
          highlight_words?: Json
          id?: string
          is_hook?: boolean
          order_index?: number
          project_id?: string
          start_time?: number
          text?: string
          top_video_url?: string | null
          user_id?: string
          zoom?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subtitles: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
          words: Json
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
          words?: Json
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
          words?: Json
        }
        Relationships: [
          {
            foreignKeyName: "subtitles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      project_status:
        | "uploading"
        | "transcribing"
        | "analyzing"
        | "ready"
        | "failed"
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
      app_role: ["admin", "user"],
      project_status: [
        "uploading",
        "transcribing",
        "analyzing",
        "ready",
        "failed",
      ],
    },
  },
} as const
