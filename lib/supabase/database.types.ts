import type {
  Allocation,
  Alert,
  AlertFrequency,
  AlertKind,
  Asset,
  AssetType,
  ChatLog,
  ChatRole,
  Json,
  NotifyFrequency,
  Numeric,
  Price,
  PriceUnit,
  Report,
  ReportType,
  Transaction,
  TransactionType,
  UserSettings,
} from "@/lib/finance/types";

export type Database = {
  public: {
    Tables: {
      assets: {
        Row: Asset;
        Insert: {
          id?: string;
          user_id?: string;
          type: AssetType;
          symbol: string;
          quantity?: Numeric;
          avg_buy_price?: Numeric | null;
          target_min_weight?: Numeric | null;
          target_max_weight?: Numeric | null;
          risk_level?: number | null;
          manual_value?: Numeric | null;
          price_unit?: PriceUnit;
          allocation_class?: AssetType;
          allocation_class_source?: "auto" | "manual";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Asset>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          user_id?: string;
          asset_id: string;
          type: TransactionType;
          qty: Numeric;
          price: Numeric;
          date: string;
          note?: string | null;
        };
        Update: Partial<Transaction>;
        Relationships: [
          {
            foreignKeyName: "transactions_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      prices: {
        Row: Price;
        Insert: {
          id?: string;
          user_id?: string;
          asset_type: AssetType;
          symbol: string;
          price: Numeric;
          source: string;
          timestamp?: string;
        };
        Update: Partial<Price>;
        Relationships: [];
      };
      allocations: {
        Row: Allocation;
        Insert: {
          id?: string;
          user_id?: string;
          asset_type: AssetType;
          min_percent: Numeric;
          max_percent: Numeric;
          formula_version: string;
          valid_from?: string;
          valid_to?: string | null;
        };
        Update: Partial<Allocation>;
        Relationships: [];
      };
      alerts: {
        Row: Alert;
        Insert: {
          id?: string;
          user_id?: string;
          rule: string;
          threshold: Numeric;
          channel: string;
          is_active?: boolean;
          frequency: string;
          kind?: AlertKind;
          message?: string | null;
          asset_type?: AssetType | null;
          created_at?: string;
          sent?: boolean;
          sent_at?: string | null;
        };
        Update: Partial<Alert>;
        Relationships: [];
      };
      settings: {
        Row: UserSettings;
        Insert: {
          user_id?: string;
          telegram_chat_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<UserSettings>;
        Relationships: [];
      };
      alert_frequencies: {
        Row: AlertFrequency;
        Insert: {
          user_id?: string;
          kind: AlertKind;
          frequency: NotifyFrequency;
          last_sent_at?: string | null;
        };
        Update: Partial<AlertFrequency>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: {
          id?: string;
          user_id?: string;
          type: ReportType;
          content: Json;
          created_at?: string;
        };
        Update: Partial<Report>;
        Relationships: [];
      };
      chat_logs: {
        Row: ChatLog;
        Insert: {
          id?: string;
          user_id?: string;
          role: ChatRole;
          message: string;
          context?: Json | null;
          timestamp?: string;
        };
        Update: Partial<ChatLog>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      replace_allocation: {
        Args: {
          p_asset_type: AssetType;
          p_min_percent: number;
          p_max_percent: number;
          p_formula_version: string;
        };
        Returns: Allocation;
      };
    };
    Enums: {
      asset_type: AssetType;
      transaction_type: TransactionType;
      report_type: ReportType;
      chat_role: ChatRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
