import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { FileCode2, Send, Download, RefreshCw } from "lucide-react";
import { useEsocialEvents, useGenerateEsocialXml, useMarkEsocialSent } from "@/hooks/use-rh-flows";

const STATUS_VARIANT: Record<string, any> = {
  pendente: "secondary", gerado: "default", enviado: "outline", aceito: "default", erro: "destructive",
};

export default function RHESocial() {
  const [status, setStatus] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const { data: events = [], isLoading, refetch } = useEsocialEvents({
    status: status !== "all" ? status : undefined,
    event_type: eventType !== "all" ? eventType : undefined,
  });
  const genXml = useGenerateEsocialXml();
  const markSent = useMarkEsocialSent();
  const [xmlOpen, setXmlOpen] = useState(false);
  const [xmlContent, setXmlContent] = useState("");
  const [sentDialog, setSentDialog] = useState<any>(null);
  const [protocol, setProtocol] = useState("");
  const [receipt, setReceipt] = useState("");

  async function handleGenerateXml(id: string) {
    try {
      const r = await genXml.mutateAsync(id);
      setXmlContent(r.xml);
      setXmlOpen(true);
    } catch (e: any) { toast.error(e?.message || "Erro ao gerar XML"); }
  }
  function copyXml() { navigator.clipboard.writeText(xmlContent); toast.success("XML copiado"); }
  function downloadXml(id: string) {
    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `esocial-${id}.xml`; a.click();
    URL.revokeObjectURL(url);
  }
  async function confirmSent() {
    if (!sentDialog) return;
    try {
      await markSent.mutateAsync({ id: sentDialog.id, protocol, receipt });
      toast.success("Marcado como enviado");
      setSentDialog(null); setProtocol(""); setReceipt("");
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><FileCode2 className="h-8 w-8" /> eSocial</h1>
          <p className="text-muted-foreground">Fila de eventos gerados pelo sistema. Ambiente: homologação.</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
      </div>

      <Card className="p-4 flex flex-wrap gap-4">
        <div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="gerado">Gerado</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="aceito">Aceito</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="S-2200">S-2200 · Admissão</SelectItem>
              <SelectItem value="S-2230">S-2230 · Afastamentos</SelectItem>
              <SelectItem value="S-2299">S-2299 · Desligamento</SelectItem>
              <SelectItem value="S-1200">S-1200 · Remuneração mensal</SelectItem>
              <SelectItem value="S-3000">S-3000 · Exclusão</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Protocolo</TableHead>
              <TableHead>Criado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8">Carregando…</TableCell></TableRow>}
            {!isLoading && events.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum evento — os primeiros aparecem aqui após uma admissão ou demissão.</TableCell></TableRow>}
            {events.map((ev: any) => (
              <TableRow key={ev.id}>
                <TableCell><Badge variant="outline">{ev.event_type}</Badge></TableCell>
                <TableCell className="font-medium">{ev.employee_name || "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[ev.status] || "secondary"}>{ev.status}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{ev.protocol || "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(ev.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => handleGenerateXml(ev.id)}><FileCode2 className="h-4 w-4 mr-1" /> XML</Button>
                  {ev.status !== "enviado" && ev.status !== "aceito" && (
                    <Button size="sm" onClick={() => setSentDialog(ev)}><Send className="h-4 w-4 mr-1" /> Marcar enviado</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={xmlOpen} onOpenChange={setXmlOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>XML do evento</DialogTitle></DialogHeader>
          <pre className="bg-muted/50 p-3 rounded text-xs overflow-auto max-h-[60vh]">{xmlContent}</pre>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={copyXml}>Copiar</Button>
            <Button onClick={() => downloadXml("evento")}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sentDialog} onOpenChange={o => !o && setSentDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar como enviado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Registra o protocolo/recibo devolvido pelo governo. Guarde os recibos por 5 anos.</p>
            <div><label className="text-sm font-medium">Protocolo</label><Input value={protocol} onChange={e => setProtocol(e.target.value)} placeholder="Retornado pelo webservice" /></div>
            <div><label className="text-sm font-medium">Recibo</label><Input value={receipt} onChange={e => setReceipt(e.target.value)} placeholder="Número do recibo" /></div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSentDialog(null)}>Cancelar</Button><Button onClick={confirmSent}>Confirmar</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
