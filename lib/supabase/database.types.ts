import type {
  AccountKind,
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
  LedgerAccount,
  LedgerPosition,
  Numeric,
  Price,
  PriceDay,
  PriceFeedRow,
  PriceUnit,
  Report,
  MacroIndicatorRow,
  StockFundamentals,
  StockMonthly,
  StockPeriod,
  StockScore,
  ReportType,
  Transaction,
  TransactionType,
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
      accounts: {
        Row: LedgerAccount;
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          kind: AccountKind;
          currency: PriceUnit;
          created_at?: string;
        };
        Update: Partial<LedgerAccount>;
        Relationships: [];
      };
      positions: {
        Row: LedgerPosition;
        Insert: {
          id?: string;
          user_id?: string;
          account_id: string;
          asset_id: string;
          quantity?: Numeric;
          avg_buy_price?: Numeric | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<LedgerPosition>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          user_id?: string;
          asset_id: string;
          account_id: string;
          counter_account_id?: string | null;
          cash_asset_id?: string | null;
          type: TransactionType;
          qty: Numeric;
          price?: Numeric | null;
          fee?: Numeric;
          price_unit: PriceUnit;
          fx_rate?: Numeric | null;
          settles_cash?: boolean;
          origin?: Transaction["origin"];
          idempotency_key?: string | null;
          date: string;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Transaction>;
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
          manual_sheet?: Json;
          fetched_at?: string;
        };
        Update: Partial<StockFundamentals>;
        Relationships: [];
      };
      stock_periods: {
        Row: StockPeriod;
        Insert: {
          id?: string;
          user_id?: string;
          symbol: string;
          period: string;
          months: number;
          kind: StockPeriod["kind"];
          tracing_no: string;
          revision_of?: string | null;
          figures: Json;
          source: string;
          fetched_at?: string;
        };
        Update: Partial<StockPeriod>;
        Relationships: [];
      };
      stock_monthly: {
        Row: StockMonthly;
        Insert: {
          id?: string;
          user_id?: string;
          symbol: string;
          period: string;
          sales_value?: Numeric | null;
          sales_qty?: Numeric | null;
          production_qty?: Numeric | null;
          avg_rate?: Numeric | null;
          tracing_no: string;
          source: string;
        };
        Update: Partial<StockMonthly>;
        Relationships: [];
      };
      stock_scores: {
        Row: StockScore;
        Insert: {
          id?: string;
          user_id?: string;
          symbol: string;
          as_of?: string;
          trigger: StockScore["trigger"];
          score?: Numeric | null;
          status: string;
          model_version: string;
          factors: Json;
          observation: Json;
          forward_pe?: Numeric | null;
        };
        Update: Partial<StockScore>;
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
      post_transaction: {
        Args: {
          p_asset_id: string;
          p_type: TransactionType;
          p_qty: number;
          p_traded_on: string;
          p_account_id?: string;
          p_price?: number | null;
          p_fee?: number;
          p_settles_cash?: boolean;
          p_cash_asset_id?: string;
          p_counter_account_id?: string;
          p_origin?: Transaction["origin"];
          p_fx_rate?: number;
          p_note?: string;
          p_idempotency_key?: string;
        };
        Returns: Transaction;
      };
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
      account_kind: AccountKind;
      asset_type: AssetType;
      transaction_type: TransactionType;
      trade_side: TradeSide;
      report_type: ReportType;
      chat_role: ChatRole;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
