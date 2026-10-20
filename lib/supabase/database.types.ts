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
  PriceDay,
  PriceFeedRow,
  PriceUnit,
  Report,
  MacroIndicatorRow,
  StockFundamentals,
  ReportType,
  Trade,
  TradeSide,
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
          acquired_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Asset>;
        Relationships: [];
      };
      trades: {
        Row: Trade;
        Insert: {
          id?: string;
          user_id?: string;
          asset_id?: string | null;
          asset_type: AssetType;
          symbol: string;
          side: TradeSide;
          quantity: Numeric;
          price?: Numeric | null;
          fee?: Numeric;
          price_unit?: PriceUnit;
          traded_on: string;
          settles_cash?: boolean;
          cash_asset_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Trade>;
        Relationships: [];
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
      price_feeds: {
        Row: PriceFeedRow;
        Insert: {
          user_id?: string;
          asset_type: AssetType;
          symbol: string;
          price_enabled?: boolean;
          codal_enabled?: boolean;
          added?: boolean;
          created_at?: string;
        };
        Update: Partial<PriceFeedRow>;
        Relationships: [];
      };
      price_days: {
        Row: PriceDay;
        Insert: {
          user_id: string;
          asset_type: AssetType;
          symbol: string;
          day: string;
          price: Numeric;
          source: string;
          quoted_at: string;
        };
        Update: Partial<PriceDay>;
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
    Views: {
      latest_prices: {
        Row: Price;
        Relationships: [];
      };
    };
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
      trade_side: TradeSide;
      report_type: ReportType;
      chat_role: ChatRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
