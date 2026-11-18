import type {
  Allocation,
  Alert,
  AlertFrequency,
  AlertKind,
  PushSubscriptionRecord,
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
  HoldingSnapshotRow,
  MacroIndicatorRow,
  PortfolioSnapshotRow,
  StockFundamentals,
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
          bale_chat_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<UserSettings>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRecord;
        Insert: {
          id?: string;
          user_id?: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: Partial<PushSubscriptionRecord>;
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
      stock_fundamentals: {
        Row: StockFundamentals;
        Insert: {
          id?: string;
          user_id?: string;
          symbol: string;
          pe?: Numeric | null;
          eps?: Numeric | null;
          roe?: Numeric | null;
          profit_margin?: Numeric | null;
          sales_trend?: Json;
          latest_tracing_no?: string | null;
          latest_title?: string | null;
          published_label?: string | null;
          adjusted?: boolean;
          source: string;
          shape_error?: string | null;
          market_report?: Json;
          fetched_at?: string;
        };
        Update: Partial<StockFundamentals>;
        Relationships: [];
      };
      macro_indicators: {
        Row: MacroIndicatorRow;
        Insert: {
          id?: string;
          indicator: string;
          value: Numeric;
          date: string;
          source: string;
          fetched_at?: string;
        };
        Update: Partial<MacroIndicatorRow>;
        Relationships: [];
      };
      portfolio_snapshots: {
        Row: PortfolioSnapshotRow;
        Insert: {
          id?: string;
          user_id?: string;
          day: string;
          total_value: Numeric;
          captured_at?: string;
        };
        Update: Partial<PortfolioSnapshotRow>;
        Relationships: [];
      };
      holding_snapshots: {
        Row: HoldingSnapshotRow;
        Insert: {
          id?: string;
          user_id?: string;
          asset_id: string;
          day: string;
          quantity: Numeric;
          price?: Numeric | null;
          value: Numeric;
          captured_at?: string;
        };
        Update: Partial<HoldingSnapshotRow>;
        Relationships: [
          {
            foreignKeyName: "holding_snapshots_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
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
      post_transaction: {
        Args: {
          p_asset_id: string;
          p_type: TransactionType;
          p_qty: number;
          p_traded_on: string;
          p_price?: number;
          p_note?: string | null;
          p_settles_cash?: boolean;
        };
        Returns: Transaction;
      };
      adjust_average: {
        Args: {
          p_asset_id: string;
          p_price: number;
          p_traded_on: string;
          p_note?: string | null;
        };
        Returns: null;
      };
      reset_price_history: {
        Args: { p_user_id: string };
        Returns: number;
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
