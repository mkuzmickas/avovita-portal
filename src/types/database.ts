// =============================================================================
// AvoVita Patient Portal — Database TypeScript Types
// =============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export type ShippingSchedule = "weekly_wednesday" | "same_day" | "kit_only" | "other";
export type ResultsVisibility = "full" | "none" | "partial";
export type AccountRole = "patient" | "admin";
export type BiologicalSex = "male" | "female" | "intersex";
export type Relationship =
  | "account_holder"
  | "spouse_partner"
  | "child"
  | "parent"
  | "sibling"
  | "friend"
  | "colleague"
  // Representative / caregiver roles — used when is_dependent = true
  | "power_of_attorney"
  | "parent_guardian"
  | "healthcare_worker"
  | "other";

/**
 * Subset of Relationship used for the representative → client dropdown
 * in the caregiver checkout flow. Kept small on purpose; "spouse_partner"
 * and "other" come from the general union.
 */
export type RepresentativeRelationship =
  | "power_of_attorney"
  | "parent_guardian"
  | "spouse_partner"
  | "healthcare_worker"
  | "other";
export type ConsentType =
  | "general_pipa"
  | "cross_border_us"
  | "cross_border_de"
  | "cross_border_ca"
  | "collection_authorization";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "scheduled"
  | "collected"
  | "shipped"
  | "resulted"
  | "complete"
  | "cancelled";

export type ManifestStatus = "open" | "closed";

export type ExpenseCategory =
  | "software"
  | "utilities"
  | "supplies"
  | "labour"
  | "shipping"
  | "marketing"
  | "other";
export type ExpenseFrequency = "monthly" | "annual" | "one_time";

export type QuoteStatus = "draft" | "sent" | "accepted" | "expired";
export type NotificationChannel = "email" | "sms";
export type NotificationStatus = "sent" | "failed";

// ─────────────────────────────────────────────────────────────────────────────
// Table row types
// ─────────────────────────────────────────────────────────────────────────────

export interface Lab {
  id: string;
  name: string;
  country: string;
  shipping_schedule: ShippingSchedule;
  shipping_notes: string | null;
  results_visibility: ResultsVisibility;
  turnaround_min_days: number | null;
  turnaround_max_days: number | null;
  turnaround_notes: string | null;
  cross_border_country: string | null;
  created_at: string;
}

export interface Test {
  id: string;
  lab_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  price_cad: number | null;
  turnaround_display: string | null;
  turnaround_min_days: number | null;
  turnaround_max_days: number | null;
  turnaround_note: string | null;
  specimen_type: string | null;
  /** @deprecated Legacy freeform field — kept read-only during the
   *  handling_type backfill and will be dropped in a follow-up
   *  migration. New writes should only update handling_type. */
  ship_temp: string | null;
  /** @deprecated Replaced by handling_type. Kept as a read-only
   *  fallback during backfill. */
  ship_temperature:
    | "ambient"
    | "refrigerated"
    | "frozen"
    | "warm_37c"
    | "cold_chain"
    | null;
  handling_type:
    | "refrigerated_only"
    | "frozen_only"
    | "ambient_only"
    | "refrigerated_or_frozen"
    | null;
  stability_notes: string | null;
  stability_days: number | null;
  /** Only populated when handling_type = 'refrigerated_or_frozen'. */
  stability_days_frozen: number | null;
  active: boolean;
  featured: boolean;
  collection_method: "phlebotomist_draw" | "self_collected_kit";
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  /** Only populated on representative accounts (rep's mobile for SMS). */
  phone: string | null;
  role: AccountRole;
  waiver_completed: boolean;
  waiver_completed_at: string | null;
  waiver_ip_address: string | null;
  waiver_signed_name: string | null;
  waiver_version: string | null;
  /** True when the account holder is a caregiver / POA placing orders
   *  on behalf of dependent clients rather than themselves. */
  is_representative: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientProfile {
  id: string;
  account_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  biological_sex: BiologicalSex;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  is_minor: boolean;
  is_primary: boolean;
  relationship: Relationship | null;
  /** True when this profile is a dependent client — someone the account
   *  holder has authority to order testing for (not the account holder
   *  themselves). */
  is_dependent: boolean;
  /** The representative's POA acknowledgement — true once the rep has
   *  ticked the "I have legal authority" checkbox on a relevant order. */
  poa_confirmed: boolean;
  poa_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Consent {
  id: string;
  profile_id: string | null;
  account_id: string;
  consent_type: ConsentType;
  consent_text_version: string;
  ip_address: string | null;
  user_agent: string | null;
  consented_at: string;
}

export interface Order {
  id: string;
  account_id: string;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string | null;
  status: OrderStatus;
  subtotal_cad: number | null;
  discount_cad: number | null;
  home_visit_fee_cad: number | null;
  tax_cad: number | null;
  total_cad: number | null;
  notes: string | null;
  fedex_tracking_number: string | null;
  shipped_at: string | null;
  shipping_date: string | null;
  appointment_date: string | null;
  manifest_id: string | null;
  /** True when the order contains at least one supplement line. */
  has_supplements: boolean;
  /** Fulfillment method for supplements: 'shipping' ($40) or 'coordinated' ($0). */
  supplement_fulfillment: import("./supplements").SupplementFulfillment | null;
  /** Shipping fee paid for supplement delivery. */
  supplement_shipping_fee_cad: number;
  /** Shipping address (JSONB) when supplement_fulfillment = 'shipping'. */
  supplement_shipping_address: import("./supplements").SupplementShippingAddress | null;
  created_at: string;
  updated_at: string;
}

export interface Manifest {
  id: string;
  name: string;
  ship_date: string;
  status: ManifestStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  name: string;
  amount_cad: number;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  contact_email: string | null;
  active: boolean;
  created_at: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  client_first_name: string | null;
  client_last_name: string | null;
  client_email: string | null;
  person_count: number;
  collection_city: string | null;
  notes: string | null;
  status: QuoteStatus;
  subtotal_cad: number;
  discount_cad: number;
  visit_fee_cad: number;
  /** Pre-tax total. Add `gst_cad` to get the grand total shown to the
   *  customer — matches the checkout totals pattern. */
  total_cad: number;
  /** 5% GST snapshotted at save time. NULL on legacy rows — display
   *  derives it from total_cad until the next save persists it. */
  gst_cad: number | null;
  /** Admin-entered additional discount; `value` is a dollar amount when
   *  type=amount or a percentage (0-100) of the post-multi-test subtotal
   *  when type=percent. */
  manual_discount_value: number;
  manual_discount_type: "amount" | "percent";
  sent_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteLine {
  id: string;
  quote_id: string;
  test_id: string;
  person_label: string | null;
  unit_price_cad: number;
  discount_applied: number;
  created_at: string;
}

export interface OrderLine {
  id: string;
  order_id: string;
  /** Discriminator: 'test' | 'supplement' | 'resource'. */
  line_type: import("./supplements").OrderLineType | "resource";
  /** Set when line_type = 'test'. */
  test_id: string | null;
  /** Set when line_type = 'supplement'. */
  supplement_id: string | null;
  /** Set when line_type = 'resource'. */
  resource_id: string | null;
  profile_id: string;
  quantity: number;
  unit_price_cad: number;
  created_at: string;
}

export interface VisitGroup {
  id: string;
  order_id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  base_fee_cad: number;
  additional_person_count: number;
  additional_fee_cad: number;
  total_fee_cad: number;
  created_at: string;
}

export type ResultStatus = "partial" | "final";

export interface Result {
  id: string;
  order_id: string;
  profile_id: string;
  lab_reference_number: string | null;
  storage_path: string;
  file_name: string;
  result_status: ResultStatus;
  uploaded_by: string;
  uploaded_at: string;
  notified_at: string | null;
  viewed_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  profile_id: string;
  order_id: string | null;
  result_id: string | null;
  channel: NotificationChannel;
  template: string;
  recipient: string;
  status: NotificationStatus;
  sent_at: string;
  error_message: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite / join types
// ─────────────────────────────────────────────────────────────────────────────

export interface TestWithLab extends Test {
  lab: Lab;
}

export interface OrderLineWithDetails extends OrderLine {
  test: TestWithLab;
  profile: PatientProfile;
  result?: Result;
}

export interface OrderWithLines extends Order {
  order_lines: OrderLineWithDetails[];
  visit_groups: VisitGroup[];
}

export interface PatientDashboard {
  account: Account;
  profiles: PatientProfile[];
  recent_orders: OrderWithLines[];
  unviewed_results_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase Database type for createClient<Database>()
// Must match the Supabase GenericSchema format exactly.
// ─────────────────────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      labs: {
        Row: Lab;
        Insert: Omit<Lab, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<Lab, "id">>;
        Relationships: [];
      };
      tests: {
        Row: Test;
        Insert: Omit<Test, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Test, "id">>;
        Relationships: [
          {
            foreignKeyName: "tests_lab_id_fkey";
            columns: ["lab_id"];
            isOneToOne: false;
            referencedRelation: "labs";
            referencedColumns: ["id"];
          }
        ];
      };
      accounts: {
        Row: Account;
        Insert: Omit<Account, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Account, "id">>;
        Relationships: [];
      };
      patient_profiles: {
        Row: PatientProfile;
        Insert: Omit<PatientProfile, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PatientProfile, "id">>;
        Relationships: [
          {
            foreignKeyName: "patient_profiles_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
      consents: {
        Row: Consent;
        Insert: Omit<Consent, "id" | "consented_at"> & {
          id?: string;
          consented_at?: string;
        };
        Update: Partial<Pick<Consent, "id">>;
        Relationships: [
          {
            foreignKeyName: "consents_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "patient_profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: Order;
        Insert: Omit<Order, "id" | "created_at" | "updated_at" | "has_supplements" | "supplement_shipping_fee_cad"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          has_supplements?: boolean;
          supplement_shipping_fee_cad?: number;
        };
        Update: Partial<Omit<Order, "id">>;
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
      order_lines: {
        Row: OrderLine;
        Insert: Omit<OrderLine, "id" | "created_at" | "line_type"> & {
          id?: string;
          created_at?: string;
          line_type?: import("./supplements").OrderLineType;
        };
        Update: Partial<Omit<OrderLine, "id">>;
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_lines_test_id_fkey";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "tests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_lines_supplement_id_fkey";
            columns: ["supplement_id"];
            isOneToOne: false;
            referencedRelation: "supplements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_lines_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_lines_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "patient_profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      supplements: {
        Row: import("./supplements").Supplement;
        Insert: Omit<import("./supplements").Supplement, "id" | "created_at" | "updated_at" | "active" | "featured" | "track_inventory" | "stock_qty" | "low_stock_threshold"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          active?: boolean;
          featured?: boolean;
          track_inventory?: boolean;
          stock_qty?: number;
          low_stock_threshold?: number;
        };
        Update: Partial<Omit<import("./supplements").Supplement, "id">>;
        Relationships: [];
      };
      resources: {
        Row: import("./resources").Resource;
        Insert: Omit<import("./resources").Resource, "id" | "created_at" | "updated_at" | "active" | "featured" | "download_count"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          active?: boolean;
          featured?: boolean;
          download_count?: number;
        };
        Update: Partial<Omit<import("./resources").Resource, "id">>;
        Relationships: [];
      };
      resource_purchases: {
        Row: import("./resources").ResourcePurchase;
        Insert: Omit<import("./resources").ResourcePurchase, "id" | "created_at" | "download_count"> & {
          id?: string;
          created_at?: string;
          download_count?: number;
        };
        Update: Partial<Omit<import("./resources").ResourcePurchase, "id">>;
        Relationships: [
          {
            foreignKeyName: "resource_purchases_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "resources";
            referencedColumns: ["id"];
          }
        ];
      };
      visit_groups: {
        Row: VisitGroup;
        Insert: Omit<VisitGroup, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<VisitGroup, "id">>;
        Relationships: [
          {
            foreignKeyName: "visit_groups_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      results: {
        Row: Result;
        Insert: Omit<Result, "id" | "uploaded_at" | "created_at"> & {
          id?: string;
          uploaded_at?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Result, "id">>;
        Relationships: [
          {
            foreignKeyName: "results_order_line_id_fkey";
            columns: ["order_line_id"];
            isOneToOne: false;
            referencedRelation: "order_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "results_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "patient_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "results_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "sent_at"> & {
          id?: string;
          sent_at?: string;
        };
        Update: Partial<Omit<Notification, "id">>;
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "patient_profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart / checkout types (client-side only)
// ─────────────────────────────────────────────────────────────────────────────

export interface CartItem {
  test: TestWithLab;
  profile_id: string;
  quantity: number;
}

export interface VisitFeeBreakdown {
  address_key: string;
  address_label: string;
  profile_ids: string[];
  person_count: number;
  base_fee: number;
  additional_fee: number;
  total_fee: number;
}

export interface CheckoutSummary {
  items: CartItem[];
  subtotal: number;
  visit_fee_breakdowns: VisitFeeBreakdown[];
  total_visit_fees: number;
  total: number;
}
