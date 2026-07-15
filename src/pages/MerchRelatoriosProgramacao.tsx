import { useState, useRef, useEffect } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useBrands } from "@/hooks/use-merchandising";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";
import { Plus, Trash2, Send, Calendar, Mail, MessageCircle, Edit, Play, Eye, Image as ImageIcon, Upload, Loader2, X, Download, History, CheckCircle2, XCircle, Clock } from "lucide-react";
import { API_URL } from "@/lib/api";

// Uploader de logo: preview + botão "Carregar do computador"
function LogoField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const url = await uploadFile(f);
      if (url) { onChange(url); toast.success(`${label} carregada`); }
    } catch (e: any) { toast.error(e.message || "Erro ao enviar imagem"); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="flex items-center gap-2">
        {value ? (
          <div className="h-12 w-20 rounded border bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">
            <img src={resolveMediaUrl(value) || value} alt={label} className="max-h-full max-w-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </div>
        ) : (
          <div className="h-12 w-20 rounded border border-dashed bg-muted/20 flex items-center justify-center text-muted-foreground shrink-0">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
              {value ? "Trocar" : "Carregar do computador"}
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")} title="Remover">
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="ou cole uma URL" className="h-7 text-xs" />
        </div>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Botão para carregar múltiplas logos (empresa + cliente) de uma só vez
function MultiLogoUploader({ onLogos }: { onLogos: (urls: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).slice(0, 2);
    try {
      const urls: string[] = [];
      for (const f of arr) {
        const u = await uploadFile(f);
        if (u) urls.push(u);
      }
      if (urls.length) { onLogos(urls); toast.success(`${urls.length} logo(s) carregada(s)`); }
    } catch (e: any) { toast.error(e.message || "Erro ao enviar imagens"); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  };
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={isUploading}>
        {isUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
        Carregar logos do computador
      </Button>
    </>
  );
}

const ALL_BRANDS = "__all__";

const FREQUENCIES = [
  { value: "hourly", label: "De hora em hora" },
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "monthly", label: "Mensal" },
  { value: "ondemand", label: "Sob demanda" },
];

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Recipient { name: string; email: string; phone: string }

interface Schedule {
  id: string;
  brand_id: string | null;
  brand_name?: string;
  name: string;
  metrics: { scheduled?: boolean; completed?: boolean; not_done?: boolean };
  frequency: string;
  day_of_week: number;
  day_of_month: number;
  send_hour: number;
  channels: { email?: boolean; whatsapp?: boolean };
  format: "pdf" | "link";
  recipients: Recipient[];
  active: boolean;
  next_run_at?: string | null;
  last_run_at?: string | null;
  company_logo_url?: string | null;
  client_logo_url?: string | null;
  header_title?: string | null;
  footer_text?: string | null;
  primary_color?: string | null;
  include_org_logo?: boolean;
  include_brand_logo?: boolean;
  report_type?: "summary" | "analytical" | "both";
  include_cover?: boolean;
  include_chart?: boolean;
  email_intro?: string | null;
  whatsapp_intro?: string | null;
}

const emptyForm: Partial<Schedule> = {
  brand_id: null,
  name: "",
  metrics: { scheduled: true, completed: true, not_done: true },
  frequency: "weekly",
  day_of_week: 1,
  day_of_month: 1,
  send_hour: 8,
  channels: { email: true, whatsapp: false },
  format: "pdf",
  recipients: [],
  active: true,
  company_logo_url: "",
  client_logo_url: "",
  header_title: "",
  footer_text: "",
  primary_color: "#1e293b",
  include_org_logo: true,
  include_brand_logo: true,
  report_type: "both",
  include_cover: true,
  include_chart: true,
  email_intro: "",
  whatsapp_intro: "",
};

const BRANDING_STORAGE_KEY = "merch-report-branding-defaults";

export default function MerchRelatoriosProgramacao() {
  const qc = useQueryClient();
  const { data: brands = [] } = useBrands();
  const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ["merch-report-schedules"],
    queryFn: () => api<Schedule[]>("/api/merch-report-schedules"),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Schedule>>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, brand_id: form.brand_id === ALL_BRANDS ? null : form.brand_id };
      if (editId) return api(`/api/merch-report-schedules/${editId}`, { method: "PUT", body });
      return api("/api/merch-report-schedules", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success("Programação salva");
      setOpen(false); setForm(emptyForm); setEditId(null);
      qc.invalidateQueries({ queryKey: ["merch-report-schedules"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/api/merch-report-schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Programação removida");
      qc.invalidateQueries({ queryKey: ["merch-report-schedules"] });
    },
  });

  const sendNow = useMutation({
    mutationFn: (id: string) => api(`/api/merch-report-schedules/${id}/send-now`, { method: "POST", body: {} }),
    onSuccess: (data: any) => {
      const sent = data?.results?.filter((r: any) => r.status === "sent" || r.status === "queued").length || 0;
      const failed = data?.results?.filter((r: any) => r.status === "failed").length || 0;
      toast.success(`Enviado: ${sent} · Falhas: ${failed}`);
      qc.invalidateQueries({ queryKey: ["merch-report-schedules"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro no envio"),
  });

  const startEdit = (s: Schedule) => {
    setForm({ ...s, brand_id: s.brand_id || ALL_BRANDS });
    setEditId(s.id);
    setOpen(true);
  };

  const startNew = () => {
    setForm({ ...emptyForm, brand_id: ALL_BRANDS });
    setEditId(null);
    setOpen(true);
  };

  const updateRecipient = (i: number, field: keyof Recipient, v: string) => {
    const list = [...(form.recipients || [])];
    list[i] = { ...list[i], [field]: v } as Recipient;
    setForm({ ...form, recipients: list });
  };
  const addRecipient = () => setForm({ ...form, recipients: [...(form.recipients || []), { name: "", email: "", phone: "" }] });
  const removeRecipient = (i: number) => {
    const list = [...(form.recipients || [])];
    list.splice(i, 1);
    setForm({ ...form, recipients: list });
  };

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [logsFor, setLogsFor] = useState<Schedule | null>(null);
  const [downloadFor, setDownloadFor] = useState<Schedule | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [dlFrom, setDlFrom] = useState<string>(weekAgo);
  const [dlTo, setDlTo] = useState<string>(today);
  const [dlLoading, setDlLoading] = useState(false);

  const doDownload = async (s: Schedule, from?: string, to?: string) => {
    try {
      setDlLoading(true);
      const token = localStorage.getItem("token") || localStorage.getItem("auth_token") || "";
      const qs = from && to ? `?date_from=${from}&date_to=${to}` : "";
      const res = await fetch(`${API_URL}/api/merch-report-schedules/${s.id}/pdf${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const periodTag = from && to ? `_${from}_${to}` : "";
      a.download = `${(s.name || "relatorio").replace(/[^\w-]+/g, "_")}${periodTag}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadFor(null);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao baixar PDF");
    } finally {
      setDlLoading(false);
    }
  };

  const openDownload = (s: Schedule) => {
    setDlFrom(weekAgo);
    setDlTo(today);
    setDownloadFor(s);
  };

  const { data: deliveries = [] } = useQuery<any[]>({
    queryKey: ["merch-report-deliveries", logsFor?.id],
    queryFn: () => api(`/api/merch-report-schedules/${logsFor!.id}/deliveries`),
    enabled: !!logsFor,
  });

  const handlePreview = async () => {
    try {
      setPreviewLoading(true);
      const token = localStorage.getItem("token") || localStorage.getItem("auth_token") || "";
      const body = { ...form, brand_id: form.brand_id === ALL_BRANDS ? null : form.brand_id };
      const res = await fetch(`${API_URL}/api/merch-report-schedules/preview-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const [brandingOpen, setBrandingOpen] = useState(false);
  const [brandingForm, setBrandingForm] = useState<Partial<Schedule>>(() => {
    try {
      const saved = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (saved) return { ...emptyForm, brand_id: ALL_BRANDS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return { ...emptyForm, brand_id: ALL_BRANDS };
  });

  useEffect(() => {
    try { localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(brandingForm)); } catch { /* ignore */ }
  }, [brandingForm]);

  const previewBranding = async () => {
    try {
      setPreviewLoading(true);
      const token = localStorage.getItem("token") || localStorage.getItem("auth_token") || "";
      const body = { ...brandingForm, brand_id: brandingForm.brand_id === ALL_BRANDS ? null : brandingForm.brand_id };
      const res = await fetch(`${API_URL}/api/merch-report-schedules/preview-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Programação de Relatórios</h1>
            <p className="text-sm text-muted-foreground">Envio automático por e-mail e WhatsApp — por marca</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setBrandingOpen(true)}>
              <Eye className="mr-2 h-4 w-4" /> Personalizar & Visualizar PDF
            </Button>
            <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" /> Nova programação</Button>
          </div>
        </div>

        <Card className="bg-primary/5 border-primary/10">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            💡 Para adicionar <b>logos</b>, <b>cores</b>, <b>título</b> e <b>rodapé</b> do PDF, clique em <b>"Personalizar & Visualizar PDF"</b> acima (funciona sem criar programação) — ou abra uma programação existente para editar.
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Programações ativas</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma programação. Crie a primeira para enviar relatórios automáticos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Frequência</TableHead>
                    <TableHead>Canais</TableHead>
                    <TableHead>Destinatários</TableHead>
                    <TableHead>Próximo envio</TableHead>
                    <TableHead>Ativo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.brand_name || "Todas"}</TableCell>
                      <TableCell>{FREQUENCIES.find(f => f.value === s.frequency)?.label || s.frequency}</TableCell>
                      <TableCell className="space-x-1">
                        {s.channels?.email && <Badge variant="secondary"><Mail className="h-3 w-3 mr-1" />E-mail</Badge>}
                        {s.channels?.whatsapp && <Badge variant="secondary"><MessageCircle className="h-3 w-3 mr-1" />WhatsApp</Badge>}
                      </TableCell>
                      <TableCell>{(s.recipients || []).length}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.next_run_at ? new Date(s.next_run_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                      </TableCell>
                      <TableCell>{s.active ? <Badge>Ativo</Badge> : <Badge variant="outline">Pausado</Badge>}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => openDownload(s)} title="Baixar PDF (escolha o período)">
                          <Download className="h-3 w-3 mr-1" /> Baixar PDF
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => sendNow.mutate(s.id)} disabled={sendNow.isPending} title="Gerar e enviar agora">
                          <Play className="h-3 w-3 mr-1" /> Enviar agora
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLogsFor(s)} title="Logs de envio">
                          <History className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(s)}><Edit className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm("Remover?") && del.mutate(s.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar programação" : "Nova programação"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Relatório semanal Marca X" />
                </div>
                <div>
                  <Label>Marca</Label>
                  <Select value={form.brand_id || ALL_BRANDS} onValueChange={(v) => setForm({ ...form, brand_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_BRANDS}>Todas as marcas</SelectItem>
                      {brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Métricas do relatório</Label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: "scheduled", label: "Rotas agendadas" },
                    { key: "completed", label: "Rotas concluídas" },
                    { key: "not_done", label: "Não realizadas" },
                  ].map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!!(form.metrics as any)?.[m.key]}
                        onCheckedChange={(v) => setForm({ ...form, metrics: { ...(form.metrics || {}), [m.key]: !!v } })}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Frequência</Label>
                  <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {(form.frequency === "weekly" || form.frequency === "biweekly") && (
                  <div>
                    <Label>Dia da semana</Label>
                    <Select value={String(form.day_of_week ?? 1)} onValueChange={(v) => setForm({ ...form, day_of_week: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {form.frequency === "monthly" && (
                  <div>
                    <Label>Dia do mês</Label>
                    <Input type="number" min={1} max={28} value={form.day_of_month || 1}
                      onChange={(e) => setForm({ ...form, day_of_month: Number(e.target.value) })} />
                  </div>
                )}
                {form.frequency !== "ondemand" && (
                  <div>
                    <Label>Hora do envio</Label>
                    <Input type="number" min={0} max={23} value={form.send_hour ?? 8}
                      onChange={(e) => setForm({ ...form, send_hour: Number(e.target.value) })} />
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2 block">Canais</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!form.channels?.email}
                      onCheckedChange={(v) => setForm({ ...form, channels: { ...(form.channels || {}), email: !!v } })}
                    />
                    E-mail (PDF anexo)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!form.channels?.whatsapp}
                      onCheckedChange={(v) => setForm({ ...form, channels: { ...(form.channels || {}), whatsapp: !!v } })}
                    />
                    WhatsApp (resumo)
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Destinatários</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addRecipient}><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
                </div>
                <div className="space-y-2">
                  {(form.recipients || []).map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <Input placeholder="Nome" value={r.name} onChange={(e) => updateRecipient(i, "name", e.target.value)} />
                      <Input placeholder="E-mail" type="email" value={r.email} onChange={(e) => updateRecipient(i, "email", e.target.value)} />
                      <Input placeholder="WhatsApp (5511...)" value={r.phone} onChange={(e) => updateRecipient(i, "phone", e.target.value)} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeRecipient(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {(form.recipients || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum destinatário — clique em "Adicionar".</p>
                  )}
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    <Label className="font-semibold">Personalização do PDF</Label>
                  </div>
                  <MultiLogoUploader onLogos={(urls) => setForm({ ...form, company_logo_url: urls[0] ?? form.company_logo_url, client_logo_url: urls[1] ?? form.client_logo_url })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <LogoField label="Logo da empresa" value={form.company_logo_url || ""} onChange={(v) => setForm({ ...form, company_logo_url: v })} />
                    <label className="flex items-center gap-2 text-xs mt-1">
                      <Checkbox
                        checked={form.include_org_logo !== false}
                        onCheckedChange={(v) => setForm({ ...form, include_org_logo: !!v })}
                      />
                      Exibir logo da empresa
                    </label>
                  </div>
                  <div>
                    <LogoField label="Logo do cliente/marca" value={form.client_logo_url || ""} onChange={(v) => setForm({ ...form, client_logo_url: v })} />
                    <label className="flex items-center gap-2 text-xs mt-1">
                      <Checkbox
                        checked={form.include_brand_logo !== false}
                        onCheckedChange={(v) => setForm({ ...form, include_brand_logo: !!v })}
                      />
                      Exibir logo da marca (se vazio, usa logo cadastrada)
                    </label>
                  </div>
                </div>


                <div className="grid grid-cols-[1fr_1fr_120px] gap-3">
                  <div>
                    <Label className="text-xs">Título do cabeçalho</Label>
                    <Input
                      value={form.header_title || ""}
                      onChange={(e) => setForm({ ...form, header_title: e.target.value })}
                      placeholder="Nome da empresa"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Rodapé</Label>
                    <Input
                      value={form.footer_text || ""}
                      onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                      placeholder="Contato / Site / CNPJ"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cor primária</Label>
                    <Input
                      type="color"
                      value={form.primary_color || "#1e293b"}
                      onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                      className="h-10 p-1"
                    />
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                <Label className="font-semibold">Conteúdo do relatório</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={form.report_type || "both"} onValueChange={(v: any) => setForm({ ...form, report_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="summary">Resumo (KPIs + gráfico)</SelectItem>
                        <SelectItem value="analytical">Analítico (lista de PDVs)</SelectItem>
                        <SelectItem value="both">Ambos (recomendado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm mt-5">
                    <Checkbox checked={form.include_cover !== false} onCheckedChange={(v) => setForm({ ...form, include_cover: !!v })} />
                    Incluir capa
                  </label>
                  <label className="flex items-center gap-2 text-sm mt-5">
                    <Checkbox checked={form.include_chart !== false} onCheckedChange={(v) => setForm({ ...form, include_chart: !!v })} />
                    Incluir gráfico
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  O analítico traz uma tabela com todos os PDVs do período, com cores: verde = executada, amarelo = parcial, branco = não realizada.
                </p>
              </div>



              <div className="flex items-center gap-2">
                <Switch checked={form.active !== false} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                <Label className="cursor-pointer">Programação ativa</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="secondary" onClick={handlePreview} disabled={previewLoading}>
                <Eye className="h-4 w-4 mr-2" /> {previewLoading ? "Gerando..." : "Ver preview"}
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Send className="h-4 w-4 mr-2" /> Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!previewUrl} onOpenChange={(v) => { if (!v) { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
          <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Preview do relatório</DialogTitle>
            </DialogHeader>
            {previewUrl && (
              <iframe src={previewUrl} className="flex-1 w-full rounded border" title="Preview PDF" />
            )}
            <DialogFooter>
              {previewUrl && (
                <a href={previewUrl} download="preview-relatorio.pdf">
                  <Button variant="outline">Baixar PDF</Button>
                </a>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo standalone: Personalizar & Preview PDF (sem precisar criar programação) */}
        <Dialog open={brandingOpen} onOpenChange={setBrandingOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Personalizar PDF & Visualizar</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Marca (para preview com dados reais)</Label>
                <Select
                  value={(brandingForm.brand_id as string) || ALL_BRANDS}
                  onValueChange={(v) => setBrandingForm({ ...brandingForm, brand_id: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_BRANDS}>Todas as marcas</SelectItem>
                    {brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <MultiLogoUploader onLogos={(urls) => setBrandingForm({ ...brandingForm, company_logo_url: urls[0] ?? brandingForm.company_logo_url, client_logo_url: urls[1] ?? brandingForm.client_logo_url })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <LogoField label="Logo da empresa" value={brandingForm.company_logo_url || ""} onChange={(v) => setBrandingForm({ ...brandingForm, company_logo_url: v })} />
                  <label className="flex items-center gap-2 text-xs mt-1">
                    <Checkbox checked={brandingForm.include_org_logo !== false} onCheckedChange={(v) => setBrandingForm({ ...brandingForm, include_org_logo: !!v })} />
                    Exibir logo da empresa
                  </label>
                </div>
                <div>
                  <LogoField label="Logo do cliente/marca" value={brandingForm.client_logo_url || ""} onChange={(v) => setBrandingForm({ ...brandingForm, client_logo_url: v })} />
                  <label className="flex items-center gap-2 text-xs mt-1">
                    <Checkbox checked={brandingForm.include_brand_logo !== false} onCheckedChange={(v) => setBrandingForm({ ...brandingForm, include_brand_logo: !!v })} />
                    Exibir logo da marca
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1fr_120px] gap-3">
                <div>
                  <Label className="text-xs">Título do cabeçalho</Label>
                  <Input value={brandingForm.header_title || ""} onChange={(e) => setBrandingForm({ ...brandingForm, header_title: e.target.value })} placeholder="Nome da empresa" />
                </div>
                <div>
                  <Label className="text-xs">Rodapé</Label>
                  <Input value={brandingForm.footer_text || ""} onChange={(e) => setBrandingForm({ ...brandingForm, footer_text: e.target.value })} placeholder="Contato / Site / CNPJ" />
                </div>
                <div>
                  <Label className="text-xs">Cor primária</Label>
                  <Input type="color" value={brandingForm.primary_color || "#1e293b"} onChange={(e) => setBrandingForm({ ...brandingForm, primary_color: e.target.value })} className="h-10 p-1" />
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <Label className="font-semibold text-sm">Conteúdo do relatório</Label>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={brandingForm.report_type || "both"} onValueChange={(v: any) => setBrandingForm({ ...brandingForm, report_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="summary">Resumo</SelectItem>
                        <SelectItem value="analytical">Analítico</SelectItem>
                        <SelectItem value="both">Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={brandingForm.include_cover !== false} onCheckedChange={(v) => setBrandingForm({ ...brandingForm, include_cover: !!v })} />
                    Capa
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={brandingForm.include_chart !== false} onCheckedChange={(v) => setBrandingForm({ ...brandingForm, include_chart: !!v })} />
                    Gráfico
                  </label>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Este preview usa dados reais do período atual. Para salvar as personalizações, crie uma programação em "Nova programação".
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBrandingOpen(false)}>Fechar</Button>
              <Button onClick={previewBranding} disabled={previewLoading}>
                <Eye className="h-4 w-4 mr-2" /> {previewLoading ? "Gerando..." : "Ver preview do PDF"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Diálogo de Logs de Envio */}
        <Dialog open={!!logsFor} onOpenChange={(v) => { if (!v) setLogsFor(null); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Logs de envio — {logsFor?.name}</DialogTitle>
            </DialogHeader>
            {deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Nenhum envio registrado ainda. Use <b>Enviar agora</b> para gerar o primeiro envio.
                <br /><br />
                <span className="text-xs">
                  💡 Se os e-mails não chegam, verifique se o SMTP está configurado em <b>Configurações → E-mail</b>.
                  Sem SMTP ativo, os envios ficam na fila com status "failed".
                </span>
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => {
                    const finalStatus = d.email_status || d.status;
                    const isSent = finalStatus === "sent";
                    const isFailed = finalStatus === "failed";
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs">
                          {new Date(d.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        </TableCell>
                        <TableCell>
                          {d.channel === "email"
                            ? <Badge variant="secondary"><Mail className="h-3 w-3 mr-1" />E-mail</Badge>
                            : <Badge variant="secondary"><MessageCircle className="h-3 w-3 mr-1" />WhatsApp</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{d.recipient}</TableCell>
                        <TableCell className="text-xs">{d.period_start} → {d.period_end}</TableCell>
                        <TableCell>
                          {isSent ? (
                            <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Enviado</Badge>
                          ) : isFailed ? (
                            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Falha</Badge>
                          ) : (
                            <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{finalStatus}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={d.email_error || d.error || ""}>
                          {d.email_error || d.error || (isSent && d.email_sent_at ? `Enviado às ${new Date(d.email_sent_at).toLocaleTimeString("pt-BR")}` : "—")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setLogsFor(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!downloadFor} onOpenChange={(o) => !o && setDownloadFor(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Baixar PDF — escolha o período</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Relatório: <b>{downloadFor?.name}</b>
                {downloadFor?.brand_name ? <> · Marca: <b>{downloadFor.brand_name}</b></> : null}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Data inicial</Label>
                  <Input type="date" value={dlFrom} onChange={(e) => setDlFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Data final</Label>
                  <Input type="date" value={dlTo} onChange={(e) => setDlTo(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  const t = new Date(); setDlTo(t.toISOString().slice(0, 10));
                  setDlFrom(new Date(t.getTime() - 6 * 86400000).toISOString().slice(0, 10));
                }}>Últimos 7 dias</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  const t = new Date(); setDlTo(t.toISOString().slice(0, 10));
                  setDlFrom(new Date(t.getTime() - 29 * 86400000).toISOString().slice(0, 10));
                }}>Últimos 30 dias</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  const t = new Date();
                  const start = new Date(t.getFullYear(), t.getMonth(), 1);
                  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
                  setDlFrom(start.toISOString().slice(0, 10));
                  setDlTo(end.toISOString().slice(0, 10));
                }}>Mês atual</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  const t = new Date();
                  const start = new Date(t.getFullYear(), t.getMonth() - 1, 1);
                  const end = new Date(t.getFullYear(), t.getMonth(), 0);
                  setDlFrom(start.toISOString().slice(0, 10));
                  setDlTo(end.toISOString().slice(0, 10));
                }}>Mês anterior</Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDownloadFor(null)}>Cancelar</Button>
              <Button
                onClick={() => downloadFor && doDownload(downloadFor, dlFrom, dlTo)}
                disabled={dlLoading || !dlFrom || !dlTo}
              >
                {dlLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Baixar PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
