import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import { NewInvoiceForm } from "@/components/admin/NewInvoiceForm";

export const dynamic = "force-dynamic";

export default async function AdminNewInvoicePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?returnUrl=/admin/invoices/new");
  const { data: caller } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((caller as { role?: string } | null)?.role !== "admin") {
    redirect("/portal");
  }

  const service = createServiceRoleClient();
  const [supplementsRes, testsRes] = await Promise.all([
    service
      .from("supplements")
      .select("id, name, sku, price_cad")
      .eq("active", true)
      .order("name", { ascending: true }),
    service
      .from("tests")
      .select("id, name, sku, price_cad, lab:labs(name)")
      .eq("active", true)
      .order("name", { ascending: true }),
  ]);
  const supplements = (supplementsRes.data ?? []) as Array<{
    id: string;
    name: string;
    sku: string | null;
    price_cad: number | null;
  }>;
  const tests = ((testsRes.data ?? []) as Array<{
    id: string;
    name: string;
    sku: string | null;
    price_cad: number | null;
    lab: { name: string } | { name: string }[] | null;
  }>).map((t) => ({
    id: t.id,
    name: t.name,
    sku: t.sku,
    price_cad: t.price_cad ?? 0,
    lab_name: Array.isArray(t.lab) ? (t.lab[0]?.name ?? null) : (t.lab?.name ?? null),
  }));

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <Link
        href="/admin/invoices"
        className="inline-flex items-center gap-1.5 text-sm mb-3"
        style={{ color: "#e8d5a3" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Invoices
      </Link>

      <h1
        className="font-heading text-3xl font-semibold mb-2"
        style={{
          color: "#ffffff",
          fontFamily: '"Cormorant Garamond", Georgia, serif',
        }}
      >
        New <span style={{ color: "#c4973a" }}>Invoice</span>
      </h1>
      <p className="text-sm mb-6" style={{ color: "#e8d5a3" }}>
        Send a standalone invoice for supplements, Oligoscan, consultation
        time, or any other walk-in purchase. The customer pays via the
        Stripe hosted link and gets an AvoVita-branded email + SMS plus
        Stripe&apos;s own receipt.
      </p>

      <NewInvoiceForm
        supplements={supplements.map((s) => ({
          id: s.id,
          name: s.name,
          sku: s.sku,
          price_cad: s.price_cad ?? 0,
        }))}
        tests={tests}
      />
    </div>
  );
}
