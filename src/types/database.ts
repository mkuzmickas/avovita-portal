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
export type OrderType = "standard" | "kit" | "kit_with_collection";
export type AccountRole = "patient" | "admin";
export type BiologicalSex = "male" | "female" | "intersex";
export type ConsentType =
  | "general_pipa"
  | "cross_border_us"
  | "cross_border_de"
  | "cross_border_ca"
  | "collection_authorization";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "collected"
  | "shipped"
  | "resulted"
  | "complete"
  | "cancelled";
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
  price_cad: number;
  turnaround_display: string | null;
  turnaround_min_days: number | null;
  turnaround_max_days: number | null;
  turnaround_note: string | null;
  specimen_type: string | null;
  order_type: OrderType;
  stability_notes: string | null;
  active: boolean;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  email: string | null;
  role: AccountRole;
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
  home_visit_fee_cad: number | null;
  tax_cad: number | null;
  total_cad: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLine {
  id: string;
  order_id: string;
  test_id: string;
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

export interface Result {
  id: string;
  order_line_id: string;
  profile_id: string;
  lab_reference_number: string | null;
  storage_path: string;
  file_name: string;
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
        Insert: Omit<Order, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
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
        Insert: Omit<OrderLine, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
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
            foreignKeyName: "order_lines_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "patient_profiles";
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
