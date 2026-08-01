import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, CheckCircle2, ShieldCheck, FileText, Trash2 } from "lucide-react";
import {
  fetchPublicOnboarding,
  uploadPublicOnboardingFile,
  submitPublicOnboarding,
  type OnboardingField,
} from "@/hooks/use-rh-onboarding";

type DocEntry = { doc_type: string; title: string; file_url: string };

export default function PublicEmployeeOnboarding() {
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [key, setKey] = useState(searchParams.get("key") || "");
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = async (accessKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicOnboarding(token, accessKey.trim().toUpperCase());
      setForm(data);
      setValues({ ...(data.submitted_data || {}) });
      setDocs([...(data.submitted_docs || [])]);
      setUnlocked(true);
      if (data.status === "applied") setDone(true);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar");
      setUnlocked(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get("key");
    if (initial && token) load(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const requestedFields: OnboardingField[] = useMemo(() => form?.requested_fields || [], [form]);
  const requestedDocs: string[] = useMemo(() => form?.requested_docs || [], [form]);

  const docsFor = (docType: string) => docs.filter((d) => d.doc_type === docType);

  const handleUpload = async (docType: string, file?: File | null) => {
    if (!file) return;
    setUploadingDoc(docType);
    try {
      const url = await uploadPublicOnboardingFile(token, key.trim().toUpperCase(), file);
      setDocs((prev) => [...prev, { doc_type: docType, title: file.name, file_url: url }]);
      toast({ title: "Documento anexado", description: file.name });
    } catch (e: any) {
      toast({ title: "Erro no envio", description: e.message, variant: "destructive" });
    } finally {
      setUploadingDoc(null);
    }
  };

  const missingFields = requestedFields.filter((f) => !String(values[f.key] || "").trim());
  const missingDocs = requestedDocs.filter((d) => docsFor(d).length === 0);

  const handleSubmit = async () => {
    if (missingFields.length || missingDocs.length) {
      toast({
        title: "Preencha tudo antes de enviar",
        description: `Faltam ${missingFields.length} campo(s) e ${missingDocs.length} documento(s).`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await submitPublicOnboarding(token, key.trim().toUpperCase(), { data: values, docs });
      setDone(true);
      toast({ title: "Cadastro enviado!", description: "O RH vai revisar suas informações." });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Acesso ao cadastro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Informe a chave de acesso enviada pelo RH para abrir seu formulário de cadastro.
            </p>
            <div className="space-y-2">
              <Label>Chave de acesso</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="Ex: A7KD29PQ"
                className="uppercase tracking-widest"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={() => load(key)} disabled={!key.trim() || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Acessar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h1 className="text-xl font-semibold">Cadastro enviado</h1>
            <p className="text-sm text-muted-foreground">
              Recebemos suas informações e documentos. Caso falte algo, o RH enviará um novo link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cadastro de colaborador</CardTitle>
            {form?.organization_name && (
              <p className="text-sm text-muted-foreground">{form.organization_name}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {form?.candidate_name && (
              <p className="text-sm">
                Olá, <strong>{form.candidate_name}</strong>!
              </p>
            )}
            {form?.message && <p className="text-sm text-muted-foreground">{form.message}</p>}
            {form?.expires_at && (
              <Badge variant="outline">
                Válido até {new Date(form.expires_at).toLocaleDateString("pt-BR")}
              </Badge>
            )}
          </CardContent>
        </Card>

        {requestedFields.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados pessoais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {requestedFields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type={f.type === "date" ? "date" : "text"}
                    value={values[f.key] || ""}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {requestedDocs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requestedDocs.map((docType) => (
                <div key={docType} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{docType}</span>
                    <div className="relative">
                      <Button variant="outline" size="sm" disabled={uploadingDoc === docType} asChild>
                        <label className="cursor-pointer">
                          {uploadingDoc === docType ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Upload className="h-4 w-4 mr-1" />
                          )}
                          Anexar
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                              handleUpload(docType, e.target.files?.[0]);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </Button>
                    </div>
                  </div>
                  {docsFor(docType).map((d) => (
                    <div key={d.file_url} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                      <span className="flex items-center gap-1.5 truncate">
                        <FileText className="h-3.5 w-3.5" /> {d.title}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setDocs((prev) => prev.filter((x) => x.file_url !== d.file_url))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {docsFor(docType).length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum arquivo anexado.</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 space-y-3">
            {(missingFields.length > 0 || missingDocs.length > 0) && (
              <p className="text-xs text-amber-600">
                Faltam {missingFields.length} campo(s) e {missingDocs.length} documento(s).
              </p>
            )}
            <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Enviar cadastro
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
