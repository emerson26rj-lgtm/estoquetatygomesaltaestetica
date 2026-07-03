import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FileSpreadsheet } from "lucide-react";
import { statusOf, statusLabel, currency } from "@/lib/stock";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Dermasul Gestão" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*, categories(name), suppliers(name)").order("name")).data ?? [],
  });
  const { data: movements = [] } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => (await supabase.from("movements").select("*, products(name)").order("created_at", { ascending: false }).limit(500)).data ?? [],
  });

  function exportProductsPdf() {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Relatório de Estoque — Dermasul", 14, 16);
    doc.setFontSize(10); doc.text(new Date().toLocaleString("pt-BR"), 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Produto", "Categoria", "Fornecedor", "Lote", "Validade", "Qtde", "Custo", "Status"]],
      body: products.map((p: any) => [
        p.name, p.categories?.name ?? "-", p.suppliers?.name ?? "-",
        p.batch ?? "-", p.expiry_date ? new Date(p.expiry_date).toLocaleDateString("pt-BR") : "-",
        `${p.quantity} ${p.unit}`, currency(Number(p.cost_value)),
        statusLabel[statusOf(p.quantity, p.min_stock, p.expiry_date)],
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [194, 156, 141] },
    });
    doc.save(`estoque-${Date.now()}.pdf`);
  }

  function exportProductsXlsx() {
    const rows = products.map((p: any) => ({
      Produto: p.name, Codigo: p.internal_code, Categoria: p.categories?.name, Fornecedor: p.suppliers?.name,
      Lote: p.batch, Validade: p.expiry_date, Quantidade: p.quantity, Unidade: p.unit,
      Minimo: p.min_stock, Custo: p.cost_value, Status: statusLabel[statusOf(p.quantity, p.min_stock, p.expiry_date)],
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `estoque-${Date.now()}.xlsx`);
  }

  function exportMovsPdf() {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Relatório de Movimentações — Dermasul", 14, 16);
    doc.setFontSize(10); doc.text(new Date().toLocaleString("pt-BR"), 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Data", "Produto", "Tipo", "Qtde", "Motivo"]],
      body: movements.map((m: any) => [
        new Date(m.created_at).toLocaleString("pt-BR"),
        m.products?.name ?? "-",
        m.type === "in" ? "Entrada" : "Saída",
        String(m.quantity),
        m.reason ?? "-",
      ]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [194, 156, 141] },
    });
    doc.save(`movimentacoes-${Date.now()}.pdf`);
  }

  function exportMovsXlsx() {
    const rows = movements.map((m: any) => ({
      Data: new Date(m.created_at).toLocaleString("pt-BR"),
      Produto: m.products?.name, Tipo: m.type === "in" ? "Entrada" : "Saída",
      Quantidade: m.quantity, Motivo: m.reason,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
    XLSX.writeFile(wb, `movimentacoes-${Date.now()}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Exportação</p>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Relatórios</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5 bg-surface ring-1 ring-black/5 border-0 shadow-none">
          <h2 className="text-sm font-semibold">Estoque Atual</h2>
          <p className="text-xs text-text-muted mt-1">{products.length} produtos cadastrados.</p>
          <div className="flex gap-2 mt-4">
            <Button onClick={exportProductsPdf} variant="outline"><FileText className="size-4 mr-1.5" /> PDF</Button>
            <Button onClick={exportProductsXlsx} variant="outline"><FileSpreadsheet className="size-4 mr-1.5" /> Excel</Button>
          </div>
        </Card>
        <Card className="p-5 bg-surface ring-1 ring-black/5 border-0 shadow-none">
          <h2 className="text-sm font-semibold">Movimentações</h2>
          <p className="text-xs text-text-muted mt-1">{movements.length} registros (últimos 500).</p>
          <div className="flex gap-2 mt-4">
            <Button onClick={exportMovsPdf} variant="outline"><FileText className="size-4 mr-1.5" /> PDF</Button>
            <Button onClick={exportMovsXlsx} variant="outline"><FileSpreadsheet className="size-4 mr-1.5" /> Excel</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
