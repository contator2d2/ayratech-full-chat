import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, UserPlus, Users, FileText, Check, Trash2, Plus, ShieldCheck } from "lucide-react";
import { useCreateEmployee, useRhDepartments, useBranches } from "@/hooks/use-rh";
import { useFinalizeAdmission } from "@/hooks/use-rh-flows";

const STEPS = [
  { id: 1, title: "Dados Pessoais", icon: UserPlus },
  { id: 2, title: "Dados Contratuais", icon: FileText },
  { id: 3, title: "Dependentes", icon: Users },
  { id: 4, title: "Documentos", icon: ShieldCheck },
  { id: 5, title: "Revisar e Admitir", icon: Check },
];

// Valida CPF real (algoritmo módulo 11)
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
const fmtCpf = (v: string) => String(v||"").replace(/\D/g,"").slice(0,11).replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");

type Dep = { full_name: string; cpf?: string; birth_date?: string; relationship: string; ir_deduction?: boolean; family_allowance?: boolean; disabled?: boolean };

export default function RHAdmissao() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const { data: departments = [] } = useDepartments();
  const { data: branches = [] } = useBranches();
  const createEmployee = useCreateEmployee();
  const finalize = useFinalizeAdmission();

  // Formulário
  const [form, setForm] = useState<any>({
    full_name: "", cpf: "", rg: "", birth_date: "", gender: "M", marital_status: "solteiro",
    email: "", phone: "", phone2: "",
    address: "", address_number: "", complement: "", neighborhood: "", city: "", state: "", zip_code: "",
    // contratuais
    position: "", branch_id: "", department_id: "", direct_manager_id: "",
    salary: "", admission_date: new Date().toISOString().slice(0,10),
    contract_end_date: "", employment_type: "clt", role_level: "junior",
    work_schedule: "08:00-17:00",
    ctps_number: "", ctps_series: "", pis_pasep: "",
    photo_url: "",
    enable_app_access: false,
    facial_required: false,
  });
  const setField = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Dependentes
  const [deps, setDeps] = useState<Dep[]>([]);
  const addDep = () => setDeps([...deps, { full_name: "", relationship: "filho", ir_deduction: true }]);
  const rmDep = (i: number) => setDeps(deps.filter((_, idx) => idx !== i));
  const setDep = (i: number, k: keyof Dep, v: any) => setDeps(deps.map((d, idx) => idx === i ? { ...d, [k]: v } : d));

  // Validação por passo
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

  const goNext = () => {
    if (stepErrors.length) { stepErrors.forEach(m => toast.error(m)); return; }
    setStep(s => Math.min(5, s + 1));
  };
  const goPrev = () => setStep(s => Math.max(1, s - 1));

  async function finish() {
    try {
      // 1) cria colaborador
      const payload = { ...form, salary: Number(form.salary || 0) };
      delete payload.enable_app_access;
      const emp = await createEmployee.mutateAsync(payload);
      // 2) finaliza (dependentes, acesso app, S-2200)
      await finalize.mutateAsync({
        employee_id: emp.id,
        dependents: deps.filter(d => d.full_name && d.relationship),
        enable_app_access: !!form.enable_app_access,
      });
      toast.success("Admissão concluída! Evento S-2200 enfileirado no eSocial.");
      navigate(`/rh/colaboradores`);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao concluir admissão");
    }
  }

  const progress = (step / STEPS.length) * 100;

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><UserPlus className="h-8 w-8" /> Nova Admissão</h1>
        <p className="text-muted-foreground">Fluxo guiado em 5 etapas com integração eSocial (S-2200)</p>
      </div>

      {/* Stepper */}
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

      {/* Steps */}
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
            <div><Label>Telefone *</Label><Input value={form.phone} onChange={e => setField("phone", e.target.value)} /></div>
            <div><Label>Telefone 2</Label><Input value={form.phone2} onChange={e => setField("phone2", e.target.value)} /></div>
          </div>
          <Separator />
          <h3 className="font-medium">Endereço</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>CEP</Label><Input value={form.zip_code} onChange={e => setField("zip_code", e.target.value)} /></div>
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
            <div><Label>Cargo *</Label><Input value={form.position} onChange={e => setField("position", e.target.value)} /></div>
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
            <div><Label>Filial / PDV</Label>
              <Select value={form.branch_id || undefined} onValueChange={v => setField("branch_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Departamento</Label>
              <Select value={form.department_id || undefined} onValueChange={v => setField("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Tipo de contrato *</Label>
              <Select value={form.employment_type} onValueChange={v => setField("employment_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clt">CLT</SelectItem>
                  <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                  <SelectItem value="estagio">Estágio</SelectItem>
                  <SelectItem value="temporario">Temporário</SelectItem>
                  <SelectItem value="autonomo">Autônomo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data de admissão *</Label><Input type="date" value={form.admission_date} onChange={e => setField("admission_date", e.target.value)} /></div>
            <div><Label>Fim contrato (experiência)</Label><Input type="date" value={form.contract_end_date} onChange={e => setField("contract_end_date", e.target.value)} /></div>
            <div><Label>Salário base (R$) *</Label><Input type="number" step="0.01" value={form.salary} onChange={e => setField("salary", e.target.value)} /></div>
            <div><Label>Jornada</Label><Input value={form.work_schedule} onChange={e => setField("work_schedule", e.target.value)} placeholder="08:00-17:00" /></div>
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
          <h2 className="text-xl font-semibold">Etapa 4 — Documentos</h2>
          <p className="text-sm text-muted-foreground">Informe os dados oficiais aqui. Anexos (RG digitalizado, comprovante, foto 3x4, ASO admissional) você pode subir depois no perfil do colaborador em <b>RH → Documentos</b>.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>CTPS — Número</Label><Input value={form.ctps_number} onChange={e => setField("ctps_number", e.target.value)} /></div>
            <div><Label>CTPS — Série</Label><Input value={form.ctps_series} onChange={e => setField("ctps_series", e.target.value)} /></div>
            <div><Label>PIS/PASEP</Label><Input value={form.pis_pasep} onChange={e => setField("pis_pasep", e.target.value)} /></div>
            <div><Label>Foto 3x4 (URL)</Label><Input value={form.photo_url} onChange={e => setField("photo_url", e.target.value)} placeholder="https://..." /></div>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <b>Checklist recomendado:</b>
            <ul className="list-disc ml-5 mt-2 space-y-1 text-muted-foreground">
              <li>RG / CNH (frente e verso)</li>
              <li>CTPS digitalizada</li>
              <li>Comprovante de residência (últimos 90 dias)</li>
              <li>Foto 3x4 recente</li>
              <li>ASO admissional (exame médico)</li>
              <li>Certificado de reservista (homens)</li>
              <li>Título de eleitor</li>
            </ul>
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
            <div><b>Jornada:</b> {form.work_schedule}</div>
            <div><b>Fim contrato:</b> {form.contract_end_date || "—"}</div>
            <Separator className="md:col-span-2" />
            <div><b>Dependentes:</b> {deps.length}</div>
            <div><b>Acesso ao app:</b> {form.enable_app_access ? "Sim" : "Não"}</div>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm space-y-1">
            <div className="flex items-center gap-2 font-semibold text-primary"><ShieldCheck className="h-4 w-4" /> O que acontece ao clicar em "Admitir"</div>
            <ul className="ml-6 list-disc text-muted-foreground">
              <li>Criação do colaborador na base</li>
              <li>Cadastro dos dependentes</li>
              {form.enable_app_access && <li>Ativação do acesso ao app do colaborador</li>}
              <li>Enfileiramento do evento <Badge variant="secondary">S-2200</Badge> no eSocial (ambiente homologação)</li>
            </ul>
          </div>
        </Card>
      )}

      {/* Nav */}
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
