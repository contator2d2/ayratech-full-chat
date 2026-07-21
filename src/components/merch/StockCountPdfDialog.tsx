import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FileDown, Image as ImageIcon, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

function fmtNum(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "-";
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

type StockCountDetail = {
  brand_name?: string;
  pdv_name?: string;
  promoter_name?: string;
  completed_at?: string | null;
  updated_at?: string | null;
  status?: string;
  progress_pct?: number;
  completed_items?: number;
  total_items?: number;
  items?: Array<{
    id: string;
    product_name?: string;
    sku?: string;
    final_store?: number | null;
    final_stock?: number | null;
    quantity?: number | null;
  }>;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: StockCountDetail | null;
}

export function StockCountPdfDialog({ open, onOpenChange, detail }: Props) {
  const [title, setTitle] = useState("Relatório de Contagem de Estoque");
  const [subtitle, setSubtitle] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clientName, setClientName] = useState("");
  const [notes, setNotes] = useState("");
  const [clientLogo, setClientLogo] = useState<string>("");
  const [brandLogo, setBrandLogo] = useState<string>("");

  useEffect(() => {
    if (detail && open) {
      setSubtitle(`${detail.brand_name || ""} — ${detail.pdv_name || ""}`);
    }
  }, [detail, open]);

  const handleFile = async (file: File | undefined, setter: (v: string) => void) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 3MB)");
      return;
    }
    try {
      const data = await fileToDataUrl(file);
      setter(data);
    } catch {
      toast.error("Erro ao ler imagem");
    }
  };

  const rows = (detail?.items || []).map((it, i) => [
    String(i + 1),
    `${it.product_name || "-"}${it.sku ? ` (${it.sku})` : ""}`,
    fmtNum(it.final_stock),
    fmtNum(it.final_store),
    fmtNum(it.quantity),
  ]);

  const totalGeral = (detail?.items || []).reduce(
    (acc, it) => acc + (Number(it.quantity) || 0),
    0,
  );

  const generatePdf = () => {
    if (!detail) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    let cursorY = 40;

    // Logos
    try {
      if (clientLogo) doc.addImage(clientLogo, "PNG", 40, cursorY, 90, 45, undefined, "FAST");
    } catch {}
    try {
      if (brandLogo) doc.addImage(brandLogo, "PNG", pageW - 130, cursorY, 90, 45, undefined, "FAST");
    } catch {}

    cursorY += 55;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title || "Relatório de Contagem de Estoque", pageW / 2, cursorY, { align: "center" });
    cursorY += 20;

    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(subtitle, pageW / 2, cursorY, { align: "center" });
      cursorY += 16;
    }

    doc.setFontSize(9);
    doc.setTextColor(100);
    const dateStr = reportDate
      ? new Date(reportDate + "T12:00:00").toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");
    doc.text(`Data do relatório: ${dateStr}`, pageW / 2, cursorY, { align: "center" });
    cursorY += 18;
    doc.setTextColor(0);

    // Info block
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    if (clientName) {
      doc.text(`Cliente: `, 40, cursorY);
      doc.setFont("helvetica", "normal");
      doc.text(clientName, 90, cursorY);
      cursorY += 14;
    }
    const info: Array<[string, string]> = [
      ["Marca:", detail.brand_name || "-"],
      ["PDV:", detail.pdv_name || "-"],
      ["Promotor:", detail.promoter_name || "-"],
      ["Progresso:", `${detail.completed_items || 0}/${detail.total_items || 0} (${fmtNum(detail.progress_pct)}%)`],
    ];
    for (const [k, v] of info) {
      doc.setFont("helvetica", "bold");
      doc.text(k, 40, cursorY);
      doc.setFont("helvetica", "normal");
      doc.text(String(v), 110, cursorY);
      cursorY += 14;
    }
    cursorY += 6;

    autoTable(doc, {
      startY: cursorY,
      head: [["#", "Produto", "Estoque", "Frente/Gôndola", "Total"]],
      body: rows.length ? rows : [["-", "Sem itens", "-", "-", "-"]],
      foot: [["", "TOTAL GERAL", "", "", fmtNum(totalGeral)]],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 30, halign: "center" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      },
      margin: { left: 40, right: 40 },
    });

    const afterTableY = (doc as any).lastAutoTable?.finalY || cursorY + 20;

    if (notes) {
      const wrapped = doc.splitTextToSize(notes, pageW - 80);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Observações:", 40, afterTableY + 20);
      doc.setFont("helvetica", "normal");
      doc.text(wrapped, 40, afterTableY + 34);
    }

    // Footer
    const pageCount = (doc as any).getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — Página ${i}/${pageCount}`,
        pageW / 2,
        doc.internal.pageSize.getHeight() - 20,
        { align: "center" },
      );
    }

    const fname = `contagem-${(detail.brand_name || "marca").replace(/\W+/g, "_")}-${reportDate}.pdf`;
    doc.save(fname);
    toast.success("PDF gerado");
  };

  const exportItemsCsv = () => {
    if (!detail) return;
    const header = ["#", "Produto", "SKU", "Estoque", "Frente/Gôndola", "Total"];
    const lines = (detail.items || []).map((it, i) => [
      i + 1,
      it.product_name || "",
      it.sku || "",
      fmtNum(it.final_stock),
      fmtNum(it.final_store),
      fmtNum(it.quantity),
    ]);
    lines.push(["", "TOTAL GERAL", "", "", "", fmtNum(totalGeral)]);
    const csv = [header, ...lines]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contagem-${(detail.brand_name || "marca").replace(/\W+/g, "_")}-${reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Gerar Relatório PDF / CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Data do relatório</Label>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Subtítulo</Label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Nome do cliente (opcional)</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Rede Supermercados X" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-2 space-y-2">
              <Label className="text-xs flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Logo do cliente</Label>
              {clientLogo ? (
                <div className="relative">
                  <img src={clientLogo} alt="cliente" className="h-16 object-contain" />
                  <Button size="icon" variant="ghost" className="absolute top-0 right-0 h-6 w-6"
                    onClick={() => setClientLogo("")}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <Input type="file" accept="image/*"
                  onChange={(e) => handleFile(e.target.files?.[0], setClientLogo)} />
              )}
            </div>
            <div className="border rounded-lg p-2 space-y-2">
              <Label className="text-xs flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Logo da marca</Label>
              {brandLogo ? (
                <div className="relative">
                  <img src={brandLogo} alt="marca" className="h-16 object-contain" />
                  <Button size="icon" variant="ghost" className="absolute top-0 right-0 h-6 w-6"
                    onClick={() => setBrandLogo("")}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <Input type="file" accept="image/*"
                  onChange={(e) => handleFile(e.target.files?.[0], setBrandLogo)} />
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs">Observações (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas, contexto ou instruções que aparecerão no rodapé do relatório..." />
          </div>

          {detail && (
            <div className="border rounded-lg p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Prévia dos dados</p>
              <p className="text-sm">
                <b>{detail.brand_name}</b> · {detail.pdv_name} · {detail.items?.length || 0} produto(s) · Total: <b>{fmtNum(totalGeral)}</b>
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="outline" onClick={exportItemsCsv} disabled={!detail}>
            <FileDown className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
          <Button onClick={generatePdf} disabled={!detail}>
            <FileText className="h-4 w-4 mr-2" /> Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
