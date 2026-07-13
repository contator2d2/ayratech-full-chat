import { useState, useMemo } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useBrands } from "@/hooks/use-merchandising";
import { useEmployees } from "@/hooks/use-rh";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  useMerchDashboard, useMerchReportPDV, useMerchReportBrand,
  useMerchReportPromoter, useMerchReportProduct, useMerchReportCategory,
  useMerchRoutesTimeline, useMerchRankingIssues,
} from "@/hooks/use-merch-analytics";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import {
  BarChart3, Store, Building2, Package, User, Layers, Route, AlertTriangle,
  TrendingUp, TrendingDown, Camera, DollarSign, ShoppingCart, Clock, Target,
  Download, Sparkles, Filter, Calendar,
} from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";

const PERIOD_PRESETS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
];

const ALL_VALUE = "__all__";
const CHART_COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function getDateRange(preset: string): { from: string; to: string } {
  const today = new Date();
  switch (preset) {
    case 'today': return { from: format(today, 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
    case 'yesterday': { const y = subDays(today, 1); return { from: format(y, 'yyyy-MM-dd'), to: format(y, 'yyyy-MM-dd') }; }
    case 'week': return { from: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
    case 'month': return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
    default: return { from: format(subDays(today, 30), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  }
}

// Exporta CSV do relatório da aba atual usando os mesmos filtros
async function exportCurrentTab(tab: string, filters: any) {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) qs.append(k, String(v)); });
  const endpointMap: Record<string, string> = {
    dashboard: `/api/merch-analytics/dashboard?${qs}`,
    pdv: `/api/merch-analytics/report/pdv?${qs}`,
    marca: `/api/merch-analytics/report/brand?${qs}`,
    promotor: `/api/merch-analytics/report/promoter?${qs}`,
    produto: `/api/merch-analytics/report/product?${qs}`,
    categoria: `/api/merch-analytics/report/category?${qs}`,
    avarias: `/api/merch-analytics/report/stockouts?${qs}`,
  };
  const url = endpointMap[tab] || endpointMap.pdv;
  try {
    const raw = await api<any>(url);
    const rows: any[] = Array.isArray(raw) ? raw : (raw?.rows || raw?.data || []);
    if (!rows.length) { alert("Sem dados para exportar neste período/aba."); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(typeof v === "object" ? JSON.stringify(v) : v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_${tab}_${filters.date_from || ''}_${filters.date_to || ''}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  } catch (e: any) {
    alert("Erro ao exportar: " + (e?.message || e));
  }
}

export default function MerchRelatorios() {
  const [tab, setTab] = useState('dashboard');
  const [period, setPeriod] = useState('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [pdvFilter, setPdvFilter] = useState('');
  const [promoterFilter, setPromoterFilter] = useState('');

  const { data: brands = [] } = useBrands();
  const { data: employees = [] } = useEmployees();
  const { data: pdvs = [] } = useQuery({ queryKey: ['rh-pdvs-list'], queryFn: () => api<any[]>('/api/promotor/rh/pdvs') });

  const dateRange = useMemo(() => {
    if (period === 'custom' && dateFrom && dateTo) return { from: dateFrom, to: dateTo };
    return getDateRange(period);
  }, [period, dateFrom, dateTo]);

  const filters = useMemo(() => ({
    date_from: dateRange.from,
    date_to: dateRange.to,
    brand_id: brandFilter || undefined,
    pdv_id: pdvFilter || undefined,
    promoter_id: promoterFilter || undefined,
  }), [dateRange, brandFilter, pdvFilter, promoterFilter]);

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Relatórios Inteligentes
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/merch/relatorios/programacao'}>
              <Calendar className="h-4 w-4 mr-1" />Programar envios / Personalizar PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCurrentTab(tab, filters)}>
              <Download className="h-4 w-4 mr-1" />Exportar CSV
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-primary to-primary/80">
              <Sparkles className="h-4 w-4 mr-1" />Análise IA
            </Button>
          </div>
        </div>

        {/* Filters Bar */}
        <Card className="p-3">
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Período</label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIOD_PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {period === 'custom' && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">De</label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Até</label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Marca</label>
              <Select value={brandFilter || ALL_VALUE} onValueChange={v => setBrandFilter(v === ALL_VALUE ? '' : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todas</SelectItem>
                  {brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">PDV</label>
              <Select value={pdvFilter || ALL_VALUE} onValueChange={v => setPdvFilter(v === ALL_VALUE ? '' : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                  {pdvs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Promotor</label>
              <Select value={promoterFilter || ALL_VALUE} onValueChange={v => setPromoterFilter(v === ALL_VALUE ? '' : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>Todos</SelectItem>
                  {employees.filter((e: any) => e.active !== false).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="dashboard"><Target className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="pdv"><Store className="h-4 w-4 mr-1" />PDV</TabsTrigger>
            <TabsTrigger value="marca"><Building2 className="h-4 w-4 mr-1" />Marca</TabsTrigger>
            <TabsTrigger value="promotor"><User className="h-4 w-4 mr-1" />Promotor</TabsTrigger>
            <TabsTrigger value="produto"><Package className="h-4 w-4 mr-1" />Produto</TabsTrigger>
            <TabsTrigger value="categoria"><Layers className="h-4 w-4 mr-1" />Categoria</TabsTrigger>
            <TabsTrigger value="avarias"><AlertTriangle className="h-4 w-4 mr-1" />Avarias/Rupturas</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><DashboardTab filters={filters} /></TabsContent>
          <TabsContent value="pdv"><PDVTab filters={filters} /></TabsContent>
          <TabsContent value="marca"><MarcaTab filters={filters} /></TabsContent>
          <TabsContent value="promotor"><PromotorTab filters={filters} /></TabsContent>
          <TabsContent value="produto"><ProdutoTab filters={filters} /></TabsContent>
          <TabsContent value="categoria"><CategoriaTab filters={filters} /></TabsContent>
          <TabsContent value="avarias"><AvariasTab filters={filters} /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

// ===== KPI Card =====
function KPICard({ title, value, icon: Icon, subtitle, trend, color = 'primary' }: {
  title: string; value: string | number; icon: any; subtitle?: string; trend?: number; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-${color}/10`}>
            <Icon className={`h-5 w-5 text-${color}`} />
          </div>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{trend >= 0 ? '+' : ''}{trend}% vs anterior</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== Score Ring =====
function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
            className={color} strokeDasharray={`${(score / 100) * 213.6} 213.6`} strokeLinecap="round" />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${color}`}>{score}</span>
      </div>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

// ===== Dashboard Tab =====
function DashboardTab({ filters }: { filters: any }) {
  const { data, isLoading } = useMerchDashboard(filters);
  const { data: timeline = [] } = useMerchRoutesTimeline(filters);
  const { data: ranking = [] } = useMerchRankingIssues(filters);

  const k = data?.kpis || {};
  const d = data?.derived || {};

  return (
    <div className="space-y-4">
      {/* Primary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <KPICard title="Rotas Totais" value={k.total_routes || 0} icon={Route} subtitle={`${k.completed_routes || 0} concluídas`} />
        <KPICard title="Produtos Auditados" value={k.executed_products || 0} icon={Package} subtitle={`de ${k.total_products || 0} no total`} />
        <KPICard title="Marcas Atendidas" value={k.brands_served || 0} icon={Building2} />
        <KPICard title="PDVs Atendidos" value={k.pdvs_served || 0} icon={Store} />
        <KPICard title="Promotores Ativos" value={k.active_promoters || 0} icon={User} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPICard title="Fotos" value={k.photos_captured || 0} icon={Camera} />
        <KPICard title="Avarias" value={k.damages_registered || 0} icon={AlertTriangle} color="destructive" />
        <KPICard title="Rupturas" value={k.stockouts_registered || 0} icon={ShoppingCart} color="destructive" />
        <KPICard title="Pesq. Preço Concluídas" value={k.price_research_completed || 0} icon={DollarSign} />
        <KPICard title="Contagens Estoque" value={k.stock_counts || 0} icon={Package} />
        <KPICard title="Contagens Validade" value={k.expiry_counts || 0} icon={Clock} />
      </div>

      {/* Scores & Derived */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Score Operacional</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-6">
              <ScoreRing score={d.operational_score || 0} label="Geral" />
              <ScoreRing score={d.completion_rate || 0} label="Rotas" />
              <ScoreRing score={d.product_execution_rate || 0} label="Produtos" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Taxas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Conclusão de Rota</span><span className="font-semibold">{d.completion_rate || 0}%</span>
              </div>
              <Progress value={d.completion_rate || 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Execução de Produtos</span><span className="font-semibold">{d.product_execution_rate || 0}%</span>
              </div>
              <Progress value={d.product_execution_rate || 0} className="h-2" />
            </div>
            <div className="flex justify-between text-xs pt-1">
              <span>Média tempo/visita</span><span className="font-semibold">{d.avg_visit_duration_min || 0} min</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Média fotos/rota</span><span className="font-semibold">{d.avg_photos_per_route || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top PDVs com Problemas</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-48 overflow-y-auto">
            {ranking.map((r: any, i: number) => (
              <div key={r.pdv_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                  <span className="truncate max-w-[140px]">{r.pdv_name}</span>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-[10px]">{r.damages} avarias</Badge>
                  <Badge variant="outline" className="text-[10px]">{r.stockouts} rupturas</Badge>
                </div>
              </div>
            ))}
            {ranking.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sem dados</p>}
          </CardContent>
        </Card>
      </div>

      {/* Route Timeline Chart */}
      {timeline.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Evolução de Rotas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="completed" name="Concluídas" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="partial" name="Parciais" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ===== PDV Tab =====
function PDVTab({ filters }: { filters: any }) {
  const { data: rows = [] } = useMerchReportPDV(filters);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PDV</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Rede</TableHead>
                <TableHead className="text-center">Visitas</TableHead>
                <TableHead className="text-center">Marcas</TableHead>
                <TableHead className="text-center">Promotores</TableHead>
                <TableHead className="text-center">Produtos</TableHead>
                <TableHead className="text-center">Avarias</TableHead>
                <TableHead className="text-center">Rupturas</TableHead>
                <TableHead className="text-center">Tempo Médio</TableHead>
                <TableHead className="text-center">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.pdv_id}>
                  <TableCell className="font-medium">{r.pdv_name}</TableCell>
                  <TableCell className="text-sm">{r.city || '-'}</TableCell>
                  <TableCell className="text-sm">{r.network || '-'}</TableCell>
                  <TableCell className="text-center">{r.total_visits}</TableCell>
                  <TableCell className="text-center">{r.brands_served}</TableCell>
                  <TableCell className="text-center">{r.promoters}</TableCell>
                  <TableCell className="text-center">{r.executed_products}/{r.total_products}</TableCell>
                  <TableCell className="text-center">{r.damages > 0 ? <Badge variant="destructive">{r.damages}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center">{r.stockouts > 0 ? <Badge variant="destructive">{r.stockouts}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center text-sm">{Math.round(r.avg_duration_min || 0)} min</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.score >= 80 ? 'default' : r.score >= 60 ? 'secondary' : 'destructive'}>{r.score}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Sem dados para o período selecionado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Marca Tab =====
function MarcaTab({ filters }: { filters: any }) {
  const { data: rows = [] } = useMerchReportBrand(filters);
  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {rows.map((r: any) => (
          <Card key={r.brand_id}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{r.brand_name}</h3>
                  <div className="flex gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                    <span><Store className="h-3 w-3 inline mr-1" />{r.pdvs_served} PDVs</span>
                    <span><User className="h-3 w-3 inline mr-1" />{r.promoters} promotores</span>
                    <span><Route className="h-3 w-3 inline mr-1" />{r.completed}/{r.total_routes} rotas</span>
                    <span><Package className="h-3 w-3 inline mr-1" />{r.executed_products}/{r.total_products} produtos</span>
                    {r.damages > 0 && <span className="text-destructive"><AlertTriangle className="h-3 w-3 inline mr-1" />{r.damages} avarias</span>}
                    {r.stockouts > 0 && <span className="text-destructive"><ShoppingCart className="h-3 w-3 inline mr-1" />{r.stockouts} rupturas</span>}
                  </div>
                </div>
                <Badge variant={r.score >= 80 ? 'default' : r.score >= 60 ? 'secondary' : 'destructive'} className="text-lg px-3 py-1">
                  {r.score}%
                </Badge>
              </div>
              <Progress value={r.score} className="mt-3 h-2" />
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">Sem dados</CardContent></Card>}
      </div>
    </div>
  );
}

// ===== Promotor Tab =====
function PromotorTab({ filters }: { filters: any }) {
  const { data: rows = [] } = useMerchReportPromoter(filters);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Promotor</TableHead>
                <TableHead className="text-center">Rotas</TableHead>
                <TableHead className="text-center">Concluídas</TableHead>
                <TableHead className="text-center">Pendentes</TableHead>
                <TableHead className="text-center">Marcas</TableHead>
                <TableHead className="text-center">PDVs</TableHead>
                <TableHead className="text-center">Produtos</TableHead>
                <TableHead className="text-center">Fotos</TableHead>
                <TableHead className="text-center">Avarias</TableHead>
                <TableHead className="text-center">Rupturas</TableHead>
                <TableHead className="text-center">Tempo Médio</TableHead>
                <TableHead className="text-center">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.promoter_id}>
                  <TableCell className="font-medium">{r.promoter_name}</TableCell>
                  <TableCell className="text-center">{r.total_routes}</TableCell>
                  <TableCell className="text-center">{r.completed_routes}</TableCell>
                  <TableCell className="text-center">{r.pending_routes}</TableCell>
                  <TableCell className="text-center">{r.brands_served}</TableCell>
                  <TableCell className="text-center">{r.pdvs_visited}</TableCell>
                  <TableCell className="text-center">{r.products_executed}</TableCell>
                  <TableCell className="text-center">{r.photos}</TableCell>
                  <TableCell className="text-center">{r.damages > 0 ? <Badge variant="destructive">{r.damages}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center">{r.stockouts > 0 ? <Badge variant="destructive">{r.stockouts}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center text-sm">{Math.round(parseFloat(r.avg_visit_min) || 0)} min</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={r.score >= 80 ? 'default' : r.score >= 60 ? 'secondary' : 'destructive'}>{r.score}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Produto Tab =====
function ProdutoTab({ filters }: { filters: any }) {
  const { data: rows = [] } = useMerchReportProduct(filters);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">PDVs</TableHead>
                <TableHead className="text-center">Rotas</TableHead>
                <TableHead className="text-center">Executados</TableHead>
                <TableHead className="text-center">Estoque Loja</TableHead>
                <TableHead className="text-center">Estoque Depósito</TableHead>
                <TableHead className="text-center">Avarias</TableHead>
                <TableHead className="text-center">Rupturas</TableHead>
                <TableHead className="text-center">Validade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.product_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {resolveMediaUrl(r.photo_url) ? <img src={resolveMediaUrl(r.photo_url)!} alt="" className="h-8 w-8 rounded object-cover" /> : <Package className="h-5 w-5 text-muted-foreground" />}
                      <div>
                        <p className="font-medium text-sm">{r.product_name}</p>
                        {r.sku && <p className="text-xs text-muted-foreground">SKU: {r.sku}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{r.pdvs}</TableCell>
                  <TableCell className="text-center">{r.routes}</TableCell>
                  <TableCell className="text-center">{r.executed}</TableCell>
                  <TableCell className="text-center">{r.stock_store}</TableCell>
                  <TableCell className="text-center">{r.stock_stock}</TableCell>
                  <TableCell className="text-center">{parseInt(r.damages) > 0 ? <Badge variant="destructive">{r.damages}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center">{parseInt(r.stockouts) > 0 ? <Badge variant="destructive">{r.stockouts}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center">{parseInt(r.expiries) > 0 ? <Badge variant="secondary">{r.expiries}</Badge> : '0'}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Categoria Tab =====
function CategoriaTab({ filters }: { filters: any }) {
  const { data: rows = [] } = useMerchReportCategory(filters);

  const chartData = rows.slice(0, 10).map((r: any) => ({
    name: r.category_name || 'Sem categoria',
    executions: parseInt(r.executed) || 0,
    damages: parseInt(r.damages) || 0,
    stockouts: parseInt(r.stockouts) || 0,
  }));

  return (
    <div className="space-y-4">
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Execuções por Categoria</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="executions" name="Executados" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="damages" name="Avarias" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="stockouts" name="Rupturas" fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Produtos</TableHead>
                <TableHead className="text-center">Execuções</TableHead>
                <TableHead className="text-center">Concluídos</TableHead>
                <TableHead className="text-center">Estoque Total</TableHead>
                <TableHead className="text-center">Avarias</TableHead>
                <TableHead className="text-center">Rupturas</TableHead>
                <TableHead className="text-center">Validade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.category_id || 'none'}>
                  <TableCell className="font-medium">{r.category_name || 'Sem categoria'}</TableCell>
                  <TableCell className="text-center">{r.total_products}</TableCell>
                  <TableCell className="text-center">{r.total_executions}</TableCell>
                  <TableCell className="text-center">{r.executed}</TableCell>
                  <TableCell className="text-center">{r.total_stock}</TableCell>
                  <TableCell className="text-center">{parseInt(r.damages) > 0 ? <Badge variant="destructive">{r.damages}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center">{parseInt(r.stockouts) > 0 ? <Badge variant="destructive">{r.stockouts}</Badge> : '0'}</TableCell>
                  <TableCell className="text-center">{parseInt(r.expiries) > 0 ? <Badge variant="secondary">{r.expiries}</Badge> : '0'}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sem dados</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== Avarias/Rupturas Tab =====
function AvariasTab({ filters }: { filters: any }) {
  const { data: ranking = [] } = useMerchRankingIssues(filters);
  const { data: products = [] } = useMerchReportProduct(filters);

  const productsWithIssues = products.filter((p: any) => parseInt(p.damages) > 0 || parseInt(p.stockouts) > 0)
    .sort((a: any, b: any) => (parseInt(b.damages) + parseInt(b.stockouts)) - (parseInt(a.damages) + parseInt(a.stockouts)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Store className="h-4 w-4" />PDVs com Mais Problemas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ranking.slice(0, 10).map((r: any, i: number) => (
                <div key={r.pdv_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-sm truncate max-w-[180px]">{r.pdv_name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="destructive" className="text-[10px]">{r.damages} avarias</Badge>
                    <Badge variant="outline" className="text-[10px]">{r.stockouts} rupturas</Badge>
                  </div>
                </div>
              ))}
              {ranking.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Sem ocorrências</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" />Produtos com Mais Problemas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {productsWithIssues.slice(0, 10).map((r: any, i: number) => (
                <div key={r.product_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}.</span>
                    <span className="text-sm truncate max-w-[180px]">{r.product_name}</span>
                  </div>
                  <div className="flex gap-1">
                    {parseInt(r.damages) > 0 && <Badge variant="destructive" className="text-[10px]">{r.damages} avarias</Badge>}
                    {parseInt(r.stockouts) > 0 && <Badge variant="outline" className="text-[10px]">{r.stockouts} rupturas</Badge>}
                  </div>
                </div>
              ))}
              {productsWithIssues.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Sem ocorrências</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
