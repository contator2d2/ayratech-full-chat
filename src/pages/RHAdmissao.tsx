import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, UserPlus, Users, FileText, Check, Trash2, Plus, ShieldCheck, Upload, X, Loader2 } from "lucide-react";
import { useCreateEmployee, useRhDepartments } from "@/hooks/use-rh";
import { useFinalizeAdmission } from "@/hooks/use-rh-flows";
import { useSchedules } from "@/hooks/use-rh-schedules";
import { useUpload } from "@/hooks/use-upload";
import { api } from "@/lib/api";
import { formatPhone, onlyDigits } from "@/lib/br-utils";

function addDaysISO(dateISO: string, days: number) {
  if (!dateISO) return "";
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function fmtBrDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtCep(v: string) {
  const s = onlyDigits(v).slice(0, 8);
  return s.length > 5 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
}

const STEPS = [
  { id: 1, title: "Dados Pessoais", icon: UserPlus },
  { id: 2, title: "Dados Contratuais", icon: FileText },
  { id: 3, title: "Dependentes", icon: Users },
  { id: 4, title: "Documentos", icon: ShieldCheck },
  { id: 5, title: "Revisar e Admitir", icon: Check },
];

const REQUIRED_DOCS: { key: string; label: string }[] = [
  { key: "rg", label: "RG (frente e verso)" },
  { key: "cpf", label: "CPF" },
  { key: "ctps", label: "CTPS digitalizada" },
  { key: "comprovante_residencia", label: "Comprovante de residência" },
  { key: "foto_3x4", label: "Foto 3x4" },
  { key: "aso_admissional", label: "ASO admissional" },
];
const OPTIONAL_DOCS: { key: string; label: string }[] = [
  { key: "reservista", label: "Certificado de reservista" },
  { key: "titulo_eleitor", label: "Título de eleitor" },
  { key: "cnh", label: "CNH" },
  { key: "diploma", label: "Diploma / certificados" },
];

function isValidCpf(cpf: string) {
  const s = String(cpf || "").replace(/\D/g, "");
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(s[i]) * (10 - i);
  let d1 = 11 - (sum % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== Number(s[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(s[i]) * (11 - i);
  let d2 = 11 - (sum % 11); if (d2 >= 10) d2 = 0;
  return d2 === Number(s[10]);
}
const fmtCpf = (v: string) => String(v || "").replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");

type Dep = { full_name: string; cpf?: string; birth_date?: string; relationship: string; ir_deduction?: boolean; family_allowance?: boolean; disabled?: boolean };
type DocFile = { doc_type: string; title: string; file_url: string };

function DocUploader({ docKey, label, value, onChange, required }: { docKey: string; label: string; value?: DocFile; onChange: (d?: DocFile) => void; required?: boolean }) {
  const { uploadFile, isUploading } = useUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const url = await uploadFile(file);
      if (url) { onChange({ doc_type: docKey, title: label, file_url: url }); toast.success(`${label} enviado`); }
    } catch (err: any) { toast.error(err?.message || "Erro no upload"); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  }
  return (
    <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          {value ? <Check className="h-4 w-4 text-green-600 flex-shrink-0" /> : <span className={`h-2 w-2 rounded-full flex-shrink-0 ${required ? "bg-destructive" : "bg-muted-foreground/40"}`} />}
          <span className="truncate">{label}{required && !value && <span className="text-destructive"> *</span>}</span>
        </div>
        {value && <a href={value.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline truncate block">Ver arquivo</a>}
      </div>
      <input ref={inputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handle} />
      {value ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}><X className="h-4 w-4" /></Button>
      ) : (
        <Button variant="outline" size="sm" disabled={isUploading} onClick={() => inputRef.current?.click()}>
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

export default function RHAdmissao() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const { data: departments = [] } = useRhDepartments();
  const { data: schedules = [] } = useSchedules();
  const [positions, setPositions] = useState<string[]>([]);
  useEffect(() => { api<string[]>("/api/rh/positions").then(setPositions).catch(() => setPositions([])); }, []);

  const createEmployee = useCreateEmployee();
  const finalize = useFinalizeAdmission();
  const { uploadFile: uploadPhoto, isUploading: uploadingPhoto } = useUpload();
  const photoRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<any>({
    full_name: "", cpf: "", rg: "", birth_date: "", gender: "M", marital_status: "solteiro",
    email: "", phone: "", phone2: "",
    address: "", address_number: "", complement: "", neighborhood: "", city: "", state: "", zip_code: "",
    position: "", department_id: "", schedule_id: "",
    salary: "", admission_date: today,
    contract_end_date: addDaysISO(today, 90), employment_type: "experiencia", role_level: "junior",
    is_experience_contract: true, experience_days: 90,
    work_schedule: "",
    ctps_number: "", ctps_series: "", pis_pasep: "",
    photo_url: "",
    enable_app_access: false,
    facial_required: false,
  });
  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Auto-recalcular fim do contrato de experiência
  useEffect(() => {
    if (form.is_experience_contract && form.admission_date) {
      setForm((f: any) => ({ ...f, contract_end_date: addDaysISO(f.admission_date, Number(f.experience_days) || 90) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.admission_date, form.is_experience_contract, form.experience_days]);

  // Buscar endereço por CEP (ViaCEP)
  const [cepLoading, setCepLoading] = useState(false);
  async function lookupCep(cepRaw: string) {
    const cep = onlyDigits(cepRaw);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (j && !j.erro) {
        setForm((f: any) => ({
          ...f,
          address: j.logradouro || f.address,
          neighborhood: j.bairro || f.neighborhood,
          city: j.localidade || f.city,
          state: j.uf || f.state,
          complement: j.complemento || f.complement,
        }));
      } else {
        toast.error("CEP não encontrado");
      }
    } catch {
      toast.error("Falha ao consultar CEP");
    } finally { setCepLoading(false); }
  }

  const [deps, setDeps] = useState<Dep[]>([]);
  const addDep = () => setDeps([...deps, { full_name: "", relationship: "filho", ir_deduction: true }]);
  const rmDep = (i: number) => setDeps(deps.filter((_, idx) => idx !== i));
  const setDep = (i: number, k: keyof Dep, v: any) => setDeps(deps.map((d, idx) => idx === i ? { ...d, [k]: v } : d));

  const [docs, setDocs] = useState<Record<string, DocFile | undefined>>({});
  const missingRequired = REQUIRED_DOCS.filter(d => !docs[d.key]).map(d => d.label);

  const stepErrors = useMemo(() => {
    const e: string[] = [];
    if (step === 1) {
      if (!form.full_name.trim()) e.push("Nome completo é obrigatório");
      if (!isValidCpf(form.cpf)) e.push("CPF inválido");
      if (!form.birth_date) e.push("Data de nascimento é obrigatória");
      if (!form.phone) e.push("Telefone é obrigatório");
    }
    if (step === 2) {
      if (!form.position) e.push("Cargo é obrigatório");
      if (!form.admission_date) e.push("Data de admissão é obrigatória");
      if (!form.salary || Number(form.salary) <= 0) e.push("Salário deve ser maior que zero");
      if (!form.employment_type) e.push("Tipo de contrato é obrigatório");
    }
    return e;
  }, [step, form]);

  const goNext = () => { if (stepErrors.length) { stepErrors.forEach(m => toast.error(m)); return; } setStep(s => Math.min(5, s + 1)); };
  const goPrev = () => setStep(s => Math.max(1, s - 1));

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const url = await uploadPhoto(file);
      if (url) { setField("photo_url", url); setDocs(d => ({ ...d, foto_3x4: { doc_type: "foto_3x4", title: "Foto 3x4", file_url: url } })); toast.success("Foto enviada"); }
    } catch (err: any) { toast.error(err?.message || "Erro"); }
    finally { if (photoRef.current) photoRef.current.value = ""; }
  }

  async function finish() {
    try {
      const payload = { ...form, salary: Number(form.salary || 0) };
      delete payload.enable_app_access;
      delete payload.schedule_id;
      const emp = await createEmployee.mutateAsync(payload);
      await finalize.mutateAsync({
        employee_id: emp.id,
        dependents: deps.filter(d => d.full_name && d.relationship),
        enable_app_access: !!form.enable_app_access,
        schedule_id: form.schedule_id || null,
        documents: Object.values(docs).filter(Boolean),
      });
      toast.success("Admissão concluída! Evento S-2200 enfileirado no eSocial.");
      navigate(`/rh/colaboradores`);
    } catch (err: any) { toast.error(err?.message || "Erro ao concluir admissão"); }
  }

  const progress = (step / STEPS.length) * 100;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><UserPlus className="h-8 w-8" /> Nova Admissão</h1>
        <p className="text-muted-foreground">Fluxo guiado em 5 etapas com integração eSocial (S-2200)</p>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map(s => {
            const Icon = s.icon;
            const done = step > s.id, active = step === s.id;
            return (
              <div key={s.id} className="flex flex-col items-center flex-1 text-center gap-1">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 ${done ? "bg-primary text-primary-foreground border-primary" : active ? "border-primary text-primary" : "border-muted text-muted-foreground"}`}>
                  {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className={`text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}>{s.title}</span>
              </div>
            );
          })}
        </div>
        <Progress value={progress} className="h-2" />
      </Card>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Etapa 1 — Dados pessoais</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><Label>Nome completo *</Label><Input value={form.full_name} onChange={e => setField("full_name", e.target.value)} /></div>
            <div><Label>CPF *</Label><Input value={form.cpf} onChange={e => setField("cpf", fmtCpf(e.target.value))} placeholder="000.000.000-00" />
              {form.cpf && !isValidCpf(form.cpf) && <p className="text-xs text-destructive mt-1">CPF inválido</p>}
            </div>
            <div><Label>RG</Label><Input value={form.rg} onChange={e => setField("rg", e.target.value)} /></div>
            <div><Label>Data de nascimento *</Label><Input type="date" value={form.birth_date} onChange={e => setField("birth_date", e.target.value)} /></div>
            <div><Label>Sexo</Label>
              <Select value={form.gender} onValueChange={v => setField("gender", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="M">Masculino</SelectItem><SelectItem value="F">Feminino</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Estado civil</Label>
              <Select value={form.marital_status} onValueChange={v => setField("marital_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                  <SelectItem value="casado">Casado(a)</SelectItem>
                  <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                  <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                  <SelectItem value="uniao_estavel">União estável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} /></div>
            <div><Label>Telefone / WhatsApp *</Label><Input inputMode="tel" value={form.phone} onChange={e => setField("phone", formatPhone(e.target.value))} placeholder="(00) 00000-0000" /></div>
            <div><Label>Telefone 2</Label><Input inputMode="tel" value={form.phone2} onChange={e => setField("phone2", formatPhone(e.target.value))} placeholder="(00) 00000-0000" /></div>
          </div>
          <Separator />
          <h3 className="font-medium">Endereço</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>CEP</Label>
              <Input
                value={form.zip_code}
                onChange={e => setField("zip_code", fmtCep(e.target.value))}
                onBlur={e => lookupCep(e.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
              />
              {cepLoading && <p className="text-xs text-muted-foreground mt-1">Buscando endereço…</p>}
            </div>
            <div className="md:col-span-2"><Label>Endereço</Label><Input value={form.address} onChange={e => setField("address", e.target.value)} /></div>
            <div><Label>Número</Label><Input value={form.address_number} onChange={e => setField("address_number", e.target.value)} /></div>
            <div><Label>Complemento</Label><Input value={form.complement} onChange={e => setField("complement", e.target.value)} /></div>
            <div><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => setField("neighborhood", e.target.value)} /></div>
            <div><Label>Cidade</Label><Input value={form.city} onChange={e => setField("city", e.target.value)} /></div>
            <div><Label>UF</Label><Input maxLength={2} value={form.state} onChange={e => setField("state", e.target.value.toUpperCase())} /></div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Etapa 2 — Dados contratuais</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Cargo *</Label>
              <Input list="positions-list" value={form.position} onChange={e => setField("position", e.target.value)} placeholder="Digite ou selecione" />
              <datalist id="positions-list">
                {positions.map(p => <option key={p} value={p} />)}
              </datalist>
              <p className="text-xs text-muted-foreground mt-1">Selecione um cargo já cadastrado ou digite um novo.</p>
            </div>
            <div><Label>Nível</Label>
              <Select value={form.role_level} onValueChange={v => setField("role_level", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="junior">Júnior</SelectItem>
                  <SelectItem value="pleno">Pleno</SelectItem>
                  <SelectItem value="senior">Sênior</SelectItem>
                  <SelectItem value="coordenador">Coordenador</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Departamento</Label>
              <Select value={form.department_id || undefined} onValueChange={v => setField("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Jornada de trabalho</Label>
              <Select value={form.schedule_id || undefined} onValueChange={v => setField("schedule_id", v)}>
                <SelectTrigger><SelectValue placeholder={schedules.length ? "Selecionar escala" : "Nenhuma escala cadastrada"} /></SelectTrigger>
                <SelectContent>
                  {schedules.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · {s.schedule_type} · {s.weekly_hours}h/sem</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!schedules.length && <p className="text-xs text-muted-foreground mt-1">Cadastre em RH → Escalas</p>}
            </div>
            <div><Label>Tipo de contrato *</Label>
              <Select
                value={form.employment_type}
                onValueChange={v => setForm((f: any) => ({
                  ...f,
                  employment_type: v,
                  is_experience_contract: v === "experiencia",
                  contract_end_date: v === "experiencia" ? addDaysISO(f.admission_date, Number(f.experience_days) || 90) : (v === "clt" ? "" : f.contract_end_date),
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="experiencia">Contrato de Experiência (sugerido)</SelectItem>
                  <SelectItem value="clt">CLT (efetivo)</SelectItem>
                  <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                  <SelectItem value="estagio">Estágio</SelectItem>
                  <SelectItem value="temporario">Temporário</SelectItem>
                  <SelectItem value="autonomo">Autônomo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data de admissão *</Label><Input type="date" value={form.admission_date} onChange={e => setField("admission_date", e.target.value)} /></div>
            {form.is_experience_contract && (
              <div><Label>Duração da experiência (dias)</Label>
                <Select value={String(form.experience_days || 90)} onValueChange={v => setField("experience_days", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 dias</SelectItem>
                    <SelectItem value="45">45 dias (1º período)</SelectItem>
                    <SelectItem value="60">60 dias</SelectItem>
                    <SelectItem value="90">90 dias (3 meses)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Fim do contrato {form.is_experience_contract && "(experiência)"}</Label>
              <Input type="date" value={form.contract_end_date} onChange={e => setField("contract_end_date", e.target.value)} />
              {form.is_experience_contract && form.contract_end_date && (
                <p className="text-xs text-primary mt-1">Contrato de experiência encerra em <strong>{fmtBrDate(form.contract_end_date)}</strong></p>
              )}
            </div>
            <div><Label>Salário base (R$) *</Label><Input type="number" step="0.01" value={form.salary} onChange={e => setField("salary", e.target.value)} /></div>
          </div>
          <Separator />
          <div className="flex items-center space-x-2">
            <Checkbox id="app" checked={form.enable_app_access} onCheckedChange={v => setField("enable_app_access", !!v)} />
            <Label htmlFor="app">Ativar acesso ao app do colaborador (bater ponto, receber contracheque)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="face" checked={form.facial_required} onCheckedChange={v => setField("facial_required", !!v)} />
            <Label htmlFor="face">Exigir biometria facial no ponto</Label>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Etapa 3 — Dependentes <span className="text-sm text-muted-foreground font-normal">(opcional)</span></h2>
            <Button variant="outline" size="sm" onClick={addDep}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
          </div>
          {deps.length === 0 && <p className="text-sm text-muted-foreground">Nenhum dependente cadastrado. Adicione se houver — usados para IR e salário-família.</p>}
          <div className="space-y-3">
            {deps.map((d, i) => (
              <Card key={i} className="p-4 space-y-3 bg-muted/30">
                <div className="grid md:grid-cols-2 gap-3">
                  <div><Label>Nome completo *</Label><Input value={d.full_name} onChange={e => setDep(i, "full_name", e.target.value)} /></div>
                  <div><Label>CPF</Label><Input value={d.cpf || ""} onChange={e => setDep(i, "cpf", fmtCpf(e.target.value))} /></div>
                  <div><Label>Nascimento</Label><Input type="date" value={d.birth_date || ""} onChange={e => setDep(i, "birth_date", e.target.value)} /></div>
                  <div><Label>Parentesco</Label>
                    <Select value={d.relationship} onValueChange={v => setDep(i, "relationship", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conjuge">Cônjuge</SelectItem>
                        <SelectItem value="filho">Filho(a)</SelectItem>
                        <SelectItem value="enteado">Enteado(a)</SelectItem>
                        <SelectItem value="pais">Pais</SelectItem>
                        <SelectItem value="outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!d.ir_deduction} onCheckedChange={v => setDep(i, "ir_deduction", !!v)} /> Dedução IR</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!d.family_allowance} onCheckedChange={v => setDep(i, "family_allowance", !!v)} /> Salário-família</label>
                  <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!d.disabled} onCheckedChange={v => setDep(i, "disabled", !!v)} /> Deficiência (PCD)</label>
                  <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={() => rmDep(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Etapa 4 — Documentos e foto</h2>

          <div className="grid md:grid-cols-[auto_1fr] gap-4 items-center p-4 border rounded-lg bg-muted/30">
            <div className="w-28 h-36 rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden bg-background">
              {form.photo_url
                ? <img src={form.photo_url} alt="Foto 3x4" className="w-full h-full object-cover" />
                : <span className="text-xs text-muted-foreground text-center px-2">Foto 3x4</span>}
            </div>
            <div className="space-y-2">
              <div className="font-medium">Foto 3x4 do colaborador</div>
              <p className="text-xs text-muted-foreground">JPG ou PNG. Envie do seu computador.</p>
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              <Button variant="outline" size="sm" disabled={uploadingPhoto} onClick={() => photoRef.current?.click()}>
                {uploadingPhoto ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</> : <><Upload className="h-4 w-4 mr-2" /> {form.photo_url ? "Trocar foto" : "Enviar foto"}</>}
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>CTPS — Número</Label><Input value={form.ctps_number} onChange={e => setField("ctps_number", e.target.value)} /></div>
            <div><Label>CTPS — Série</Label><Input value={form.ctps_series} onChange={e => setField("ctps_series", e.target.value)} /></div>
            <div><Label>PIS/PASEP</Label><Input value={form.pis_pasep} onChange={e => setField("pis_pasep", e.target.value)} /></div>
          </div>

          <Separator />
          <div>
            <h3 className="font-medium mb-2">Checklist de documentos <span className="text-xs text-muted-foreground">(obrigatórios em vermelho)</span></h3>
            <div className="grid md:grid-cols-2 gap-2">
              {REQUIRED_DOCS.map(d => (
                <DocUploader key={d.key} docKey={d.key} label={d.label} required value={docs[d.key]} onChange={f => setDocs(prev => ({ ...prev, [d.key]: f }))} />
              ))}
              {OPTIONAL_DOCS.map(d => (
                <DocUploader key={d.key} docKey={d.key} label={d.label} value={docs[d.key]} onChange={f => setDocs(prev => ({ ...prev, [d.key]: f }))} />
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Você pode admitir mesmo faltando documentos — os pendentes ficarão sinalizados no dashboard de RH ({missingRequired.length} pendente{missingRequired.length > 1 ? "s" : ""}).
              </p>
            )}
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Etapa 5 — Revisar e Admitir</h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div><b>Nome:</b> {form.full_name}</div>
            <div><b>CPF:</b> {form.cpf}</div>
            <div><b>Nascimento:</b> {form.birth_date}</div>
            <div><b>Contato:</b> {form.phone} · {form.email}</div>
            <div className="md:col-span-2"><b>Endereço:</b> {form.address}, {form.address_number} — {form.city}/{form.state}</div>
            <Separator className="md:col-span-2" />
            <div><b>Cargo:</b> {form.position}</div>
            <div><b>Contrato:</b> {String(form.employment_type).toUpperCase()}</div>
            <div><b>Admissão:</b> {form.admission_date}</div>
            <div><b>Salário:</b> R$ {Number(form.salary || 0).toFixed(2)}</div>
            <div><b>Jornada:</b> {schedules.find((s: any) => s.id === form.schedule_id)?.name || "—"}</div>
            <div><b>Fim contrato:</b> {form.contract_end_date || "—"}</div>
            <Separator className="md:col-span-2" />
            <div><b>Dependentes:</b> {deps.length}</div>
            <div><b>Documentos anexados:</b> {Object.values(docs).filter(Boolean).length}</div>
            <div><b>Acesso ao app:</b> {form.enable_app_access ? "Sim" : "Não"}</div>
          </div>
          {missingRequired.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <b>Pendências:</b> {missingRequired.join(", ")}. Ficarão sinalizadas no dashboard.
            </div>
          )}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-1">
            <div className="flex items-center gap-2 font-semibold text-primary"><ShieldCheck className="h-4 w-4" /> O que acontece ao clicar em "Admitir"</div>
            <ul className="ml-6 list-disc text-muted-foreground">
              <li>Criação do colaborador na base</li>
              <li>Cadastro dos dependentes e documentos anexados</li>
              {form.schedule_id && <li>Atribuição da jornada selecionada</li>}
              {form.enable_app_access && <li>Ativação do acesso ao app do colaborador</li>}
              <li>Enfileiramento do evento <Badge variant="secondary">S-2200</Badge> no eSocial (ambiente homologação)</li>
            </ul>
          </div>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={goPrev} disabled={step === 1}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        {step < 5 ? (
          <Button onClick={goNext}>Próximo <ChevronRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button onClick={finish} disabled={createEmployee.isPending || finalize.isPending}>
            {createEmployee.isPending || finalize.isPending ? "Processando..." : "Admitir colaborador"}
          </Button>
        )}
      </div>
    </div>
  );
}
