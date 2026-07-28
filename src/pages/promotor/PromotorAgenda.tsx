import { useState, useMemo } from "react";
import { PromotorLayout } from "./PromotorLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePromotorAgenda } from "@/hooks/use-promotor-routes";
import { Calendar, MapPin, Clock, ChevronLeft, ChevronRight, Navigation, Boxes } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, eachDayOfInterval, isSameDay, isToday as isTodayFn } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-700', confirmed: 'bg-cyan-500/20 text-cyan-700',
  in_progress: 'bg-orange-500/20 text-orange-700', completed: 'bg-green-500/20 text-green-700',
  not_done: 'bg-red-500/20 text-red-700', cancelled: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Agendada', confirmed: 'Confirmada', in_progress: 'Em Andamento',
  completed: 'Concluída', not_done: 'Não Realizada', cancelled: 'Cancelada',
};

export default function PromotorAgenda() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [currentDate, setCurrentDate] = useState(new Date());

  const dateRange = useMemo(() => {
    if (viewMode === 'month') return { from: format(startOfMonth(currentDate), 'yyyy-MM-dd'), to: format(endOfMonth(currentDate), 'yyyy-MM-dd') };
    if (viewMode === 'week') return { from: format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
    return { from: format(currentDate, 'yyyy-MM-dd'), to: format(currentDate, 'yyyy-MM-dd') };
  }, [viewMode, currentDate]);

  const { data: routes = [], isLoading } = usePromotorAgenda({ date_from: dateRange.from, date_to: dateRange.to });

  const todayRoutes = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return routes.filter((r: any) => (r.visit_date?.split('T')[0] || r.visit_date) === today);
  }, [routes]);

  const routesByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    routes.forEach((r: any) => {
      const key = r.visit_date?.split('T')[0] || r.visit_date;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [routes]);

  const nav = (dir: 'prev' | 'next') => {
    const fn = dir === 'next'
      ? viewMode === 'month' ? addMonths : viewMode === 'week' ? addWeeks : addDays
      : viewMode === 'month' ? subMonths : viewMode === 'week' ? subWeeks : subDays;
    setCurrentDate(fn(currentDate, 1));
  };

  const canOpenRoute = (r: any) => {
    const routeDate = r.visit_date?.split('T')[0] || r.visit_date;
    const today = format(new Date(), 'yyyy-MM-dd');
    return routeDate === today && (r.status === 'scheduled' || r.status === 'confirmed' || r.status === 'in_progress');
  };

  return (
    <PromotorLayout>
      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* View Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex bg-muted rounded-lg p-0.5">
            {(['day', 'week', 'month'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${viewMode === m ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground'}`}>
                {m === 'day' ? 'Dia' : m === 'week' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => nav('prev')}><ChevronLeft className="h-5 w-5" /></Button>
          <span className="text-sm font-semibold capitalize">
            {viewMode === 'day' ? format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
              : viewMode === 'week' ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'dd/MM')} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'dd/MM')}`
              : format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" onClick={() => nav('next')}><ChevronRight className="h-5 w-5" /></Button>
        </div>

        {/* Day View */}
        {viewMode === 'day' && (
          <div className="space-y-3">
            {(routesByDay[format(currentDate, 'yyyy-MM-dd')] || []).length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Sem rotas para este dia</p>
              </div>
            ) : (
              (routesByDay[format(currentDate, 'yyyy-MM-dd')] || []).map((r: any) => (
                <Card key={r.id}
                  className={`transition-all ${canOpenRoute(r) ? 'cursor-pointer active:scale-[0.98] hover:border-primary/50' : 'opacity-80'}`}
                  onClick={() => canOpenRoute(r) && navigate(`/promotor/rota/${r.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-semibold">{r.pdv_name}</div>
                        <div className="text-xs text-muted-foreground">{r.brand_name}</div>
                      </div>
                      <Badge className={STATUS_COLORS[r.status] || 'bg-muted'}>{STATUS_LABELS[r.status] || r.status}</Badge>
                    </div>
                    {r.has_stock_count && (() => {
                      const s = r.stock_count_status || 'pending';
                      const cfg: Record<string, { cls: string; label: string }> = {
                        pending: { cls: 'border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400', label: 'Contagem pendente' },
                        in_progress: { cls: 'border-orange-500/50 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400', label: 'Contagem em andamento' },
                        completed: { cls: 'border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400', label: 'Contagem concluída' },
                        postponed: { cls: 'border-blue-500/50 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400', label: 'Contagem adiada' },
                        justified: { cls: 'border-slate-400/50 bg-slate-50 text-slate-700 dark:bg-slate-950/30 dark:text-slate-300', label: 'Contagem não realizada' },
                      };
                      const c = cfg[s] || cfg.pending;
                      return (
                        <Badge variant="outline" className={`mb-2 gap-1 ${c.cls}`}>
                          <Boxes className="h-3 w-3" /> {c.label}
                        </Badge>
                      );
                    })()}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.scheduled_time?.slice(0, 5) || '--:--'}</span>
                      {r.estimated_duration_min && <span>{r.estimated_duration_min}min</span>}
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{r.pdv_city || r.pdv_address?.slice(0, 30)}</span>
                    </div>
                    {r.progress_pct > 0 && r.status === 'in_progress' && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span>Progresso</span>
                          <span className="font-mono">{Math.round(r.progress_pct)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${r.progress_pct}%` }} />
                        </div>
                      </div>
                    )}
                    {r.notes && <p className="text-xs text-muted-foreground mt-2 italic">📝 {r.notes}</p>}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Week View */}
        {viewMode === 'week' && (
          <div className="space-y-2">
            {eachDayOfInterval({
              start: startOfWeek(currentDate, { weekStartsOn: 1 }),
              end: endOfWeek(currentDate, { weekStartsOn: 1 })
            }).map(day => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const dayRoutes = routesByDay[dayStr] || [];
              return (
                <div key={dayStr} className={`rounded-lg border p-2 ${isTodayFn(day) ? 'border-primary bg-primary/5' : 'border-border/50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold capitalize">{format(day, 'EEE dd/MM', { locale: ptBR })}</span>
                    {dayRoutes.length > 0 && <Badge variant="secondary" className="text-[10px]">{dayRoutes.length} rota(s)</Badge>}
                  </div>
                  {dayRoutes.map((r: any) => (
                    <div key={r.id} className={`text-xs p-1.5 rounded mt-1 flex items-center gap-1 ${STATUS_COLORS[r.status] || 'bg-muted'}`}
                      onClick={() => { if (canOpenRoute(r)) navigate(`/promotor/rota/${r.id}`); }}>
                      <span className="flex-1">{r.scheduled_time?.slice(0, 5)} • {r.pdv_name} • {r.brand_name}</span>
                      {r.has_stock_count && <Boxes className="h-3 w-3 text-amber-600" />}
                    </div>
                  ))}
                  {dayRoutes.length === 0 && <p className="text-[10px] text-muted-foreground">Sem rotas</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* Month View */}
        {viewMode === 'month' && (
          <div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
                <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {eachDayOfInterval({
                start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
                end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
              }).map(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayRoutes = routesByDay[dayStr] || [];
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const hasStock = dayRoutes.some((r: any) => r.has_stock_count);
                return (
                  <div key={dayStr}
                    onClick={() => { setCurrentDate(day); setViewMode('day'); }}
                    className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs cursor-pointer transition-colors relative
                      ${isTodayFn(day) ? 'bg-primary text-primary-foreground font-bold' : ''}
                      ${!isCurrentMonth ? 'opacity-30' : 'hover:bg-muted'}
                      ${hasStock && !isTodayFn(day) ? 'ring-1 ring-amber-500/50 bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                    <span>{format(day, 'd')}</span>
                    {hasStock && (
                      <Boxes className={`h-2.5 w-2.5 absolute top-0.5 right-0.5 ${isTodayFn(day) ? 'text-primary-foreground' : 'text-amber-600'}`} />
                    )}
                    {dayRoutes.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayRoutes.slice(0, 3).map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-primary" />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </PromotorLayout>
  );
}
