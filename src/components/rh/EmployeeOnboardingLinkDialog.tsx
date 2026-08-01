import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Copy, Link2, Loader2, Plus, RefreshCw, ShieldX, CheckCircle2, FileText, X } from "lucide-react";
import {
  useOnboardingCatalog,
  useOnboardingLinks,
  useCreateOnboardingLink,
  useRevokeOnboardingLink,
  useApplyOnboardingLink,
  useFollowupOnboardingLink,
  buildOnboardingUrl,
  type OnboardingLink,
} from "@/hooks/use-rh-onboarding";
import { resolveMediaUrl } from "@/lib/media";

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Aguardando preenchimento", className: "bg-amber-500/10 text-amber-700 border-amber-200" },
  submitted: { label: "Enviado - revisar", className: "bg-blue-500/10 text-blue-700 border-blue-200" },
  applied: { label: "Aplicado na ficha", className: "bg-green-500/10 text-green-700 border-green-200" },
  revoked: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId?: string | null;
  employeeName?: string | null;
}

export function EmployeeOnboardingLinkDialog({ open, onOpenChange, employeeId, employeeName }: Props) {
  const { toast } = useToast();
  const { data: catalog } = useOnboardingCatalog();
  const { data: links = [], isLoading } = useOnboardingLinks(employeeId ? { employee_id: employeeId } : undefined);

  const createLink = useCreateOnboardingLink();
  const revokeLink = useRevokeOnboardingLink();
  const applyLink = useApplyOnboardingLink();
  const followup = useFollowupOnboardingLink();

  const fields = catalog?.fields || [];
  const defaultDocs = catalog?.default_docs || [];

  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [customDoc, setCustomDoc] = useState("");
  const [extraDocs, setExtraDocs] = useState<string[]>([]);
  const [candidateName, setCandidateName] = useState("");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [lastCreated, setLastCreated] = useState<OnboardingLink | null>(null);
  const [reviewing, setReviewing] = useState<OnboardingLink | null>(null);
  const [acceptFields, setAcceptFields] = useState<string[]>([]);

  const allDocs = useMemo(() => [...defaultDocs, ...extraDocs], [defaultDocs, extraDocs]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado` });
  };

  const handleCreate = async () => {
    if (!selectedFields.length && !selectedDocs.length) {
      toast({ title: "Selecione campos ou documentos", variant: "destructive" });
      return;
    }
    try {
      const link = await createLink.mutateAsync({
        employee_id: employeeId || null,
        candidate_name: candidateName || employeeName || null,
        requested_fields: selectedFields,
        requested_docs: selectedDocs,
        message: message || undefined,
        expires_in_days: expiresInDays,
      });
      setLastCreated(link);
      toast({ title: "Link gerado", description: "Copie o link e a chave e envie ao colaborador." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar link", description: e.message, variant: "destructive" });
    }
  };

  const openReview = (link: OnboardingLink) => {
    setReviewing(link);
    setAcceptFields(Object.keys(link.submitted_data || {}));
  };

  const handleApply = async () => {
    if (!reviewing) return;
    try {
      await applyLink.mutateAsync({ id: reviewing.id, accept_fields: acceptFields });
      toast({ title: "Dados aplicados na ficha do colaborador" });
      setReviewing(null);
    } catch (e: any) {
      toast({ title: "Erro ao aplicar", description: e.message, variant: "destructive" });
    }
  };

  const handleFollowup = async (link: OnboardingLink) => {
    if (!selectedFields.length && !selectedDocs.length) {
      toast({ title: "Selecione na aba 'Novo link' o que está faltando", variant: "destructive" });
      return;
    }
    try {
      const created = await followup.mutateAsync({
        id: link.id,
        requested_fields: selectedFields,
        requested_docs: selectedDocs,
        expires_in_days: expiresInDays,
      });
      setLastCreated(created);
      toast({ title: "Novo link de complemento gerado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Link de auto-cadastro
            {employeeName ? <span className="text-sm text-muted-foreground">— {employeeName}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="new">
          <TabsList>
            <TabsTrigger value="new">Novo link</TabsTrigger>
            <TabsTrigger value="list">Links enviados ({links.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4 pt-3">
            {!employeeId && (
              <div className="space-y-1.5">
                <Label>Nome do colaborador/candidato</Label>
                <Input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Nome para identificar o link" />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Dados que o colaborador deve preencher</Label>
                <Button variant="ghost" size="sm" onClick={() => setSelectedFields(selectedFields.length === fields.length ? [] : fields.map((f) => f.key))}>
                  {selectedFields.length === fields.length ? "Limpar" : "Selecionar todos"}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto border rounded-lg p-3">
                {fields.map((f) => (
                  <label key={f.key} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={selectedFields.includes(f.key)} onCheckedChange={() => toggle(selectedFields, setSelectedFields, f.key)} />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Documentos solicitados</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border rounded-lg p-3">
                {allDocs.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={selectedDocs.includes(d)} onCheckedChange={() => toggle(selectedDocs, setSelectedDocs, d)} />
                    {d}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={customDoc} onChange={(e) => setCustomDoc(e.target.value)} placeholder="Outro documento..." />
                <Button
                  variant="outline"
                  onClick={() => {
                    const name = customDoc.trim();
                    if (!name) return;
                    setExtraDocs((prev) => [...prev, name]);
                    setSelectedDocs((prev) => [...prev, name]);
                    setCustomDoc("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Mensagem para o colaborador (opcional)</Label>
                <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Validade (dias)</Label>
                <Input type="number" min={1} max={90} value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value) || 7)} />
              </div>
            </div>

            <Button onClick={handleCreate} disabled={createLink.isPending} className="w-full">
              {createLink.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
              Gerar link com chave de acesso
            </Button>

            {lastCreated && (
              <Card className="border-primary/40">
                <CardContent className="pt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Link</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={buildOnboardingUrl(lastCreated)} className="text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copy(buildOnboardingUrl(lastCreated), "Link")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Chave de acesso</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={lastCreated.access_key} className="font-mono tracking-widest" />
                      <Button variant="outline" size="icon" onClick={() => copy(lastCreated.access_key, "Chave")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="list" className="space-y-3 pt-3">
            {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {!isLoading && links.length === 0 && <p className="text-sm text-muted-foreground">Nenhum link gerado ainda.</p>}
            {links.map((link) => {
              const meta = STATUS_META[link.status] || STATUS_META.pending;
              return (
                <Card key={link.id}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{link.employee_name || link.candidate_name || "Novo colaborador"}</p>
                        <p className="text-xs text-muted-foreground">
                          Criado {new Date(link.created_at).toLocaleString("pt-BR")}
                          {link.expires_at ? ` · expira ${new Date(link.expires_at).toLocaleDateString("pt-BR")}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => copy(buildOnboardingUrl(link), "Link")}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Link
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => copy(link.access_key, "Chave")}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Chave {link.access_key}
                      </Button>
                      {link.status === "submitted" && (
                        <Button size="sm" onClick={() => openReview(link)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Revisar e aplicar
                        </Button>
                      )}
                      {(link.status === "submitted" || link.status === "applied") && (
                        <Button variant="outline" size="sm" onClick={() => handleFollowup(link)} disabled={followup.isPending}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Gerar link do que falta
                        </Button>
                      )}
                      {link.status === "pending" && (
                        <Button variant="ghost" size="sm" onClick={() => revokeLink.mutate(link.id)}>
                          <ShieldX className="h-3.5 w-3.5 mr-1" /> Cancelar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        {/* Revisão do envio */}
        <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Revisar dados enviados</DialogTitle>
            </DialogHeader>
            {reviewing && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Campos preenchidos (marque o que deseja aplicar)</Label>
                  <div className="border rounded-lg divide-y">
                    {Object.entries(reviewing.submitted_data || {}).map(([k, v]) => {
                      const label = fields.find((f) => f.key === k)?.label || k;
                      return (
                        <label key={k} className="flex items-center gap-3 p-2 text-sm cursor-pointer">
                          <Checkbox checked={acceptFields.includes(k)} onCheckedChange={() => toggle(acceptFields, setAcceptFields, k)} />
                          <span className="text-muted-foreground w-40 shrink-0 text-xs">{label}</span>
                          <span className="truncate">{String(v)}</span>
                        </label>
                      );
                    })}
                    {Object.keys(reviewing.submitted_data || {}).length === 0 && (
                      <p className="p-2 text-xs text-muted-foreground">Nenhum campo enviado.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Documentos anexados</Label>
                  <div className="space-y-1.5">
                    {(reviewing.submitted_docs || []).map((d) => (
                      <a
                        key={d.file_url}
                        href={resolveMediaUrl(d.file_url) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 hover:bg-muted"
                      >
                        <FileText className="h-3.5 w-3.5" /> {d.doc_type} — {d.title}
                      </a>
                    ))}
                    {(reviewing.submitted_docs || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum documento anexado.</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleApply} disabled={applyLink.isPending} className="flex-1">
                    {applyLink.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Aplicar na ficha
                  </Button>
                  <Button variant="outline" onClick={() => setReviewing(null)}>
                    <X className="h-4 w-4 mr-1" /> Fechar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
