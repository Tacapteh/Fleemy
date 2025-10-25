// Types globaux pour l'application Fleemy

export interface Address {
  line1: string;
  line2?: string;
  postal_code: string;
  city: string;
  country: string;
}

export interface Client {
  id: string;
  user_id: string;
  display_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: Address;
  notes?: string;
  use_global_rate: boolean;
  hourly_rate_custom?: number | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  uid: string;
  week: number;
  year: number;
  description: string;
  client_id?: string;  // ID référence vers collection clients
  client_name: string;  // client_label pour affichage
  day: string;
  start_time: string;
  end_time: string;
  status: string;
  hourly_rate: number;
  created_at: string;
  updated_at: string;
}

export interface Quote {
  id: string;
  uid: string;
  client_id?: string;  // ID référence vers collection clients
  client_name: string;
  quote_number: string;
  title: string;
  items: QuoteItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  valid_until: string;
  created_at: string;
  updated_at: string;
  // Champs préremplis depuis client
  email?: string;
  contact_name?: string;
  address?: Address;
}

export interface Invoice {
  id: string;
  uid: string;
  quote_id?: string;
  client_id?: string;  // ID référence vers collection clients
  client_name: string;
  invoice_number: string;
  title: string;
  items: QuoteItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  due_date: string;
  paid_date?: string;
  created_at: string;
  updated_at: string;
  // Champs préremplis depuis client
  email?: string;
  contact_name?: string;
  address?: Address;
}

export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}
