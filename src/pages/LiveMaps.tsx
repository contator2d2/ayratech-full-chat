import { useState, useEffect, useRef, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLiveRoutes } from "@/hooks/use-merch-routes";
import {
  MapPin, Users, Navigation, Layers, Eye, EyeOff, Search, Radio,
  Wifi, WifiOff, BatteryFull, BatteryLow, BatteryMedium, Clock, CheckCircle2,
  Loader2, Building2, Shield, Activity, User, Package, Store, ChevronRight
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.heat";



const DAY_LABELS: Record<string, string> = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };

function formatWorkSchedule(ws: any): string {
  if (!ws) return '—';
  try {
    const obj = typeof ws === 'string' ? JSON.parse(ws) : ws;
    if (!obj || typeof obj !== 'object') return String(ws);
    const days = obj.days;
    if (days && typeof days === 'object') {
      const active = Object.entries(days).filter(([, v]) => v).map(([k]) => DAY_LABELS[k] || k);
      const time = obj.entry && obj.exit ? `${obj.entry}–${obj.exit}` : '';
      return `${active.join(', ')}${time ? ` • ${time}` : ''}`;
    }
    if (obj.entry && obj.exit) return `${obj.entry}–${obj.exit}`;
    return '—';
  } catch { return String(ws); }
}

function useLiveMapData() {
  return useQuery({
    queryKey: ['live-map-data'],
    queryFn: () => api<any>('/api/promotor/rh/live-map'),
    refetchInterval: 10000, // 10s refresh
  });
}

const createDotIcon = (color: string, size = 12, pulse = false) =>
  L.divIcon({
    className: 'custom-marker',
    html: `<div style="position:relative;">
      ${pulse ? `<div style="position:absolute;top:${-size/2}px;left:${-size/2}px;width:${size*3}px;height:${size*3}px;border-radius:50%;background:${color};opacity:0.2;animation:pulse 2s infinite;"></div>` : ''}
      <div style="background:${color};width:${size*2}px;height:${size*2}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);position:relative;z-index:2;"></div>
    </div>`,
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
    popupAnchor: [0, -size],
  });

const PDV_ICON = createDotIcon('#3b82f6', 8);
const ONLINE_ICON = createDotIcon('#22c55e', 10, true);
const OFFLINE_ICON = createDotIcon('#9ca3af', 8);
const SUPERVISOR_ONLINE_ICON = createDotIcon('#f59e0b', 12, true);
const SUPERVISOR_OFFLINE_ICON = createDotIcon('#d97706', 10);
const NOCHECKIN_ICON = createDotIcon('#ef4444', 9);

function getBatteryIcon(level: number | null) {
  if (!level) return null;
  if (level > 50) return BatteryFull;
  if (level > 20) return BatteryMedium;
  return BatteryLow;
}

interface LiveMapComponentProps {
  employees: any[];
  pdvs: any[];
  regions: any[];
  showPDVs: boolean;
  showPromoters: boolean;
  showSupervisors: boolean;
  showRegions: boolean;
  searchTerm: string;
  showHeatmap: boolean;
}


function LiveMapComponent({ employees, pdvs, regions, showPDVs, showPromoters, showSupervisors, showRegions, searchTerm, showHeatmap }: LiveMapComponentProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<L.LayerGroup>(L.layerGroup());
  const clusterRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);


  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView([-14.235, -51.9253], 4);

    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 19 }
    );
    const labels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Labels © Esri', maxZoom: 19 }
    );
    const hybrid = L.layerGroup([satellite, labels]);

    streets.addTo(mapRef.current);
    L.control.layers(
      { 'Mapa': streets, 'Satélite': satellite, 'Híbrido': hybrid },
      undefined,
      { position: 'topright', collapsed: false }
    ).addTo(mapRef.current);

    layersRef.current.addTo(mapRef.current);

    // Add pulse animation CSS
    const style = document.createElement('style');
    style.textContent = `@keyframes pulse { 0% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.5); opacity: 0.1; } 100% { transform: scale(1); opacity: 0.3; } }`;
    document.head.appendChild(style);

    return () => { mapRef.current?.remove(); mapRef.current = null; style.remove(); };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    layersRef.current.clearLayers();
    if (clusterRef.current) {
      mapRef.current.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }
    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    const bounds: L.LatLng[] = [];
    const search = searchTerm.toLowerCase();
    const heatData: any[] = [];

    // Initialize cluster group with some spacing/jitter
    const markerCluster = (L as any).markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      // Spacing: slightly offset markers at exact same location
      animate: true
    });
    clusterRef.current = markerCluster;

    // Regions
    if (showRegions) {
      regions.forEach(r => {
        const polygon = Array.isArray(r.polygon) ? r.polygon : [];
        if (polygon.length >= 3) {
          const poly = L.polygon(polygon, { color: r.color || '#3b82f6', fillOpacity: 0.08, weight: 2 });
          poly.bindPopup(`<b>${r.name}</b><br/>Supervisor: ${r.supervisor_name || '—'}`);
          layersRef.current.addLayer(poly);
        }
      });
    }

    // PDVs
    if (showPDVs) {
      pdvs.forEach(p => {
        if (!p.latitude || !p.longitude) return;
        if (search && !p.name?.toLowerCase().includes(search) && !p.city?.toLowerCase().includes(search)) return;
        const pos = L.latLng(Number(p.latitude), Number(p.longitude));
        bounds.push(pos);
        heatData.push([Number(p.latitude), Number(p.longitude), 0.5]);

        const marker = L.marker(pos, { icon: PDV_ICON });
        marker.bindPopup(`<b>📍 ${p.name}</b><br/>${p.client_name || ''}<br/>${p.city || ''}-${p.state || ''}`);
        
        if (showHeatmap) {
          // In heatmap mode, we don't add individual markers to map, just collect data
        } else {
          markerCluster.addLayer(marker);
        }
        
        if (p.radius_meters && !showHeatmap) {
          L.circle(pos, { radius: p.radius_meters, color: '#3b82f6', fillOpacity: 0.05, weight: 1 }).addTo(layersRef.current);
        }
      });
    }

    // Employees
    employees.forEach(e => {
      const isSupervisor = e.worker_profile === 'supervisor' || e.worker_profile === 'administrativo';
      if (isSupervisor && !showSupervisors) return;
      if (!isSupervisor && !showPromoters) return;
      if (search && !e.full_name?.toLowerCase().includes(search)) return;

      const lat = e.live_lat || e.home_latitude;
      const lng = e.live_lng || e.home_longitude;
      if (!lat || !lng) return;

      const pos = L.latLng(Number(lat), Number(lng));
      bounds.push(pos);
      heatData.push([Number(lat), Number(lng), isSupervisor ? 1.0 : 0.8]);

      if (!showHeatmap) {
        const now = new Date();
        const updatedTime = e.location_updated_at ? new Date(e.location_updated_at) : null;
        const isLocRecent = updatedTime && (now.getTime() - updatedTime.getTime()) < 15 * 60 * 1000; // Recente se < 15min
        
        // Consider online if server says so OR if we have a very recent location update
        const isOnline = e.live_status === 'online' || isLocRecent;
        
        const hasCheckedIn = parseInt(e.punch_count) > 0;
        let icon;
        if (isSupervisor) {
          icon = isOnline ? SUPERVISOR_ONLINE_ICON : SUPERVISOR_OFFLINE_ICON;
        } else if (!hasCheckedIn) {
          icon = NOCHECKIN_ICON;
        } else {
          icon = isOnline ? ONLINE_ICON : OFFLINE_ICON;
        }

        const marker = L.marker(pos, { icon });
        const statusHtml = isOnline
          ? '<span style="color:#22c55e;font-weight:600;">🟢 Online</span>'
          : '<span style="color:#9ca3af;">⚫ Offline</span>';

        const lastUpdate = e.location_updated_at
          ? `<br/><span style="font-size:11px;color:#888;">📡 ${formatDistanceToNow(new Date(e.location_updated_at), { addSuffix: true, locale: ptBR })}</span>`
          : '';

        const punchInfo = hasCheckedIn
          ? `<br/><span style="font-size:11px;color:#22c55e;">✅ Check-in: ${e.last_punch_type}${e.last_pdv_name ? ` @ ${e.last_pdv_name}` : ''}</span>`
          : '<br/><span style="font-size:11px;color:#ef4444;">❌ Sem check-in hoje</span>';

        const batteryHtml = e.battery_level != null
          ? `<br/><span style="font-size:11px;">🔋 ${e.battery_level}%</span>`
          : '';

        marker.bindPopup(`
          <div style="min-width:180px;">
            <b>${isSupervisor ? '👨‍💼' : '👷'} ${e.full_name}</b>
            <br/><span style="font-size:12px;color:#666;">${e.position || e.worker_profile}</span>
            <br/>${statusHtml}
            ${punchInfo}
            ${e.current_brands ? `<br/><span style="font-size:11px;color:#f59e0b;">🏷️ ${e.current_brands}</span>` : ''}
            ${lastUpdate}
            ${batteryHtml}
            <br/><span style="font-size:11px;color:#888;">⏰ Jornada: ${formatWorkSchedule(e.work_schedule)}</span>
          </div>
        `);
        markerCluster.addLayer(marker);
      }
    });

    if (showHeatmap && heatData.length > 0) {
      heatLayerRef.current = (L as any).heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1: 'red' }
      }).addTo(mapRef.current!);
    } else {
      mapRef.current!.addLayer(markerCluster);
    }

    if (bounds.length > 0) {
      mapRef.current!.fitBounds(L.latLngBounds(bounds).pad(0.1));
    }
  }, [employees, pdvs, regions, showPDVs, showPromoters, showSupervisors, showRegions, searchTerm, showHeatmap]);


  return <div ref={containerRef} className="w-full h-full rounded-lg" style={{ minHeight: '500px' }} />;
}

export default function LiveMaps() {
  const { data, isLoading } = useLiveMapData();
  const { data: liveRoutes = [] } = useLiveRoutes();
  const [showPDVs, setShowPDVs] = useState(true);
  const [showPromoters, setShowPromoters] = useState(true);
  const [showSupervisors, setShowSupervisors] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Build a map of promoter_id -> their routes
  const routesByPromoter = useMemo(() => {
    const map: Record<string, any[]> = {};
    liveRoutes.forEach((r: any) => {
      if (!r.promoter_id) return;
      if (!map[r.promoter_id]) map[r.promoter_id] = [];
      map[r.promoter_id].push(r);
    });
    return map;
  }, [liveRoutes]);

  const employees = data?.employees || [];
  const pdvs = data?.pdvs || [];
  const regions = data?.regions || [];

  const promoters = employees.filter((e: any) => e.worker_profile !== 'supervisor' && e.worker_profile !== 'administrativo');
  const supervisors = employees.filter((e: any) => e.worker_profile === 'supervisor' || e.worker_profile === 'administrativo');

  const onlineCount = employees.filter((e: any) => {
    const isOnlineServer = e.live_status === 'online';
    const updatedTime = e.location_updated_at ? new Date(e.location_updated_at) : null;
    const isLocRecent = updatedTime && (new Date().getTime() - updatedTime.getTime()) < 15 * 60 * 1000;
    return isOnlineServer || isLocRecent;
  }).length;
  const offlineCount = employees.length - onlineCount;
  const checkedInCount = employees.filter((e: any) => parseInt(e.punch_count) > 0).length;
  const noCheckinCount = employees.length - checkedInCount;

  const filteredEmployeeList = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return employees.filter((e: any) =>
      !search || e.full_name?.toLowerCase().includes(search)
    );
  }, [employees, searchTerm]);

  const monitoringStats = useMemo(() => {
    const activeRoutes = liveRoutes.filter((r: any) => r.status === 'in_progress');
    
    const byBrand: Record<string, number> = {};
    const byNetwork: Record<string, number> = {};
    const byPDV: Record<string, number> = {};
    
    activeRoutes.forEach((r: any) => {
      if (r.brand_name) {
        byBrand[r.brand_name] = (byBrand[r.brand_name] || 0) + 1;
      }
      
      const network = r.pdv_client || r.pdv_name?.split(' - ')[0] || 'Outros';
      byNetwork[network] = (byNetwork[network] || 0) + 1;
      
      if (r.pdv_name) {
        byPDV[r.pdv_name] = (byPDV[r.pdv_name] || 0) + 1;
      }
    });
    
    return {
      byBrand: Object.entries(byBrand).sort((a, b) => b[1] - a[1]),
      byNetwork: Object.entries(byNetwork).sort((a, b) => b[1] - a[1]),
      byPDV: Object.entries(byPDV).sort((a, b) => b[1] - a[1]),
      activeCount: activeRoutes.length
    };
  }, [liveRoutes]);

  return (
    <MainLayout>
      <div className="flex flex-col h-[calc(100vh-6rem)] gap-3">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-primary animate-pulse" />
            <div>
              <h1 className="text-lg font-bold text-foreground">Live Maps</h1>
              <p className="text-xs text-muted-foreground">Atualiza a cada 10 segundos • GPS ativo apenas em horário de trabalho</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 h-9 w-48 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 shrink-0">
          <Card><CardContent className="p-2 text-center"><p className="text-lg font-bold text-primary">{employees.length}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
          <Card className="border-green-200"><CardContent className="p-2 text-center"><p className="text-lg font-bold text-green-600">{onlineCount}</p><p className="text-[10px] text-green-600">Online</p></CardContent></Card>
          <Card><CardContent className="p-2 text-center"><p className="text-lg font-bold text-muted-foreground">{offlineCount}</p><p className="text-[10px] text-muted-foreground">Offline</p></CardContent></Card>
          <Card className="border-green-200"><CardContent className="p-2 text-center"><p className="text-lg font-bold text-green-600">{checkedInCount}</p><p className="text-[10px] text-green-600">Check-in</p></CardContent></Card>
          <Card className="border-destructive/30"><CardContent className="p-2 text-center"><p className="text-lg font-bold text-destructive">{noCheckinCount}</p><p className="text-[10px] text-destructive">Sem check-in</p></CardContent></Card>
          <Card><CardContent className="p-2 text-center"><p className="text-lg font-bold text-primary">{pdvs.filter((p: any) => p.latitude).length}</p><p className="text-[10px] text-muted-foreground">PDVs</p></CardContent></Card>
        </div>

        {/* Layer Controls */}
        <div className="flex flex-wrap gap-2 items-center shrink-0">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <Button variant={showPromoters ? 'default' : 'outline'} size="sm" onClick={() => setShowPromoters(!showPromoters)} className="gap-1.5 text-xs h-7">
            <Users className="h-3 w-3" /> Promotores ({promoters.length})
          </Button>
          <Button variant={showSupervisors ? 'default' : 'outline'} size="sm" onClick={() => setShowSupervisors(!showSupervisors)} className="gap-1.5 text-xs h-7">
            <Shield className="h-3 w-3" /> Supervisores ({supervisors.length})
          </Button>
          <Button variant={showPDVs ? 'default' : 'outline'} size="sm" onClick={() => setShowPDVs(!showPDVs)} className="gap-1.5 text-xs h-7">
            <MapPin className="h-3 w-3" /> PDVs ({pdvs.length})
          </Button>
          <Button variant={showRegions ? 'default' : 'outline'} size="sm" onClick={() => setShowRegions(!showRegions)} className="gap-1.5 text-xs h-7">
            <Navigation className="h-3 w-3" /> Regiões ({regions.length})
          </Button>
          <div className="flex-1" />
          <Button variant={showHeatmap ? 'default' : 'outline'} size="sm" onClick={() => setShowHeatmap(!showHeatmap)} className="gap-1.5 text-xs h-7 border-orange-200 text-orange-700 hover:bg-orange-50">
            <Activity className="h-3 w-3" /> Mapa de Calor
          </Button>
        </div>


        {/* Map + Sidebar */}
        <div className="flex-1 flex gap-3 min-h-0">
          {/* Map */}
          <Card className="flex-1 overflow-hidden">
            <CardContent className="p-0 h-full">
              {isLoading ? (
                <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <LiveMapComponent
                  employees={employees}
                  pdvs={pdvs}
                  regions={regions}
                  showPDVs={showPDVs}
                  showPromoters={showPromoters}
                  showSupervisors={showSupervisors}
                  showRegions={showRegions}
                  searchTerm={searchTerm}
                  showHeatmap={showHeatmap}
                />

              )}
            </CardContent>
          </Card>

          <Card className="w-80 hidden lg:flex flex-col overflow-hidden shrink-0">
            <Tabs defaultValue="team" className="flex flex-col h-full">
              <div className="px-3 pt-3 shrink-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="team" className="text-xs">Equipe</TabsTrigger>
                  <TabsTrigger value="monitor" className="text-xs">Tempo Real</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="team" className="flex-1 flex flex-col min-h-0 m-0">
                <CardHeader className="p-3 pb-2 shrink-0">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Equipe ({filteredEmployeeList.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-y-auto">

              <div className="divide-y">
                {filteredEmployeeList.map((e: any) => {
                  const now = new Date();
                  const updatedTime = e.location_updated_at ? new Date(e.location_updated_at) : null;
                  const isLocRecent = updatedTime && (now.getTime() - updatedTime.getTime()) < 15 * 60 * 1000;
                  const isOnline = e.live_status === 'online' || isLocRecent;
                  
                  const hasCheckedIn = parseInt(e.punch_count) > 0;
                  const isSupervisor = e.worker_profile === 'supervisor' || e.worker_profile === 'administrativo';
                  const BatIcon = getBatteryIcon(e.battery_level);

                  return (
                    <div
                      key={e.id}
                      className="p-2 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedEmployee(e)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="relative flex-shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                            isSupervisor ? 'bg-yellow-500' : isOnline ? 'bg-green-500' : 'bg-muted-foreground'
                          }`}>
                            {e.full_name?.charAt(0)}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${
                            isOnline ? 'bg-green-500' : 'bg-muted-foreground'
                          }`} />
                        </div>
                         <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{e.full_name}</p>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {isSupervisor && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">SUP</Badge>}
                            {(() => {
                              const empRoutes = routesByPromoter[e.id] || [];
                              const activeRoute = empRoutes.find((r: any) => r.status === 'in_progress');
                              if (activeRoute) {
                                return (
                                  <span className="text-orange-600 flex items-center gap-0.5 truncate">
                                    <Activity className="h-2.5 w-2.5 animate-pulse" />
                                    {activeRoute.pdv_name} • {Math.round(activeRoute.progress_pct || 0)}%
                                  </span>
                                );
                              }
                              const doneCount = empRoutes.filter((r: any) => r.status === 'completed').length;
                              const totalCount = empRoutes.length;
                              if (totalCount > 0) {
                                return <span className="text-green-600">{doneCount}/{totalCount} rotas</span>;
                              }
                              if (hasCheckedIn) {
                                return (
                                  <span className="text-green-600 flex items-center gap-0.5">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> {e.last_pdv_name || 'Check-in'}
                                  </span>
                                );
                              }
                              return <span className="text-destructive">Sem check-in</span>;
                            })()}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          {isOnline ? (
                            <Wifi className="h-3 w-3 text-green-500" />
                          ) : (
                            <WifiOff className="h-3 w-3 text-muted-foreground" />
                          )}
                          {BatIcon && <BatIcon className={`h-3 w-3 ${e.battery_level > 20 ? 'text-green-600' : 'text-destructive'}`} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="monitor" className="flex-1 flex flex-col min-h-0 m-0">
                <CardHeader className="p-3 pb-2 shrink-0 border-b">
                  <CardTitle className="text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-primary" /> Atividade Agora</span>
                    <Badge variant="outline" className="text-[10px] h-4">{monitoringStats.activeCount} em campo</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-y-auto">
                  <div className="p-3 space-y-4">
                    {/* Por Marca */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> Por Marca
                      </h4>
                      <div className="space-y-1">
                        {monitoringStats.byBrand.map(([brand, count]) => (
                          <div key={brand} className="flex items-center justify-between text-xs p-1.5 hover:bg-muted/50 rounded transition-colors group">
                            <span className="truncate font-medium">{brand}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 h-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">{count}</Badge>
                          </div>
                        ))}
                        {monitoringStats.byBrand.length === 0 && <p className="text-[10px] text-muted-foreground italic p-2 text-center">Nenhuma rota em execução agora</p>}
                      </div>
                    </div>

                    {/* Por Rede */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                        <Store className="h-3 w-3" /> Por Rede
                      </h4>
                      <div className="space-y-1">
                        {monitoringStats.byNetwork.map(([network, count]) => (
                          <div key={network} className="flex items-center justify-between text-xs p-1.5 hover:bg-muted/50 rounded transition-colors group">
                            <span className="truncate">{network}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 h-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Por PDV */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> PDVs Ativos
                      </h4>
                      <div className="space-y-1">
                        {monitoringStats.byPDV.map(([pdv, count]) => (
                          <div key={pdv} className="flex items-center justify-between text-xs p-1.5 hover:bg-muted/50 rounded transition-colors group">
                            <span className="truncate">{pdv}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 h-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>
        </div>


        {/* Legend */}
        <div className="flex flex-wrap gap-4 items-center text-[10px] text-muted-foreground shrink-0">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block animate-pulse" /> Online</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-muted-foreground inline-block" /> Offline</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> Supervisor</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block" /> Sem check-in</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> PDV</span>
          <span className="text-muted-foreground">• GPS desativado fora do horário de trabalho</span>
        </div>

        {/* Employee Detail Dialog */}
        <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {selectedEmployee?.full_name}
              </DialogTitle>
            </DialogHeader>
            {selectedEmployee && (() => {
              const empRoutes = routesByPromoter[selectedEmployee.id] || [];
              const now = new Date();
              const updatedTime = selectedEmployee.location_updated_at ? new Date(selectedEmployee.location_updated_at) : null;
              const isLocRecent = updatedTime && (now.getTime() - updatedTime.getTime()) < 15 * 60 * 1000;
              const isOnline = selectedEmployee.live_status === 'online' || isLocRecent;
              
              const hasCheckedIn = parseInt(selectedEmployee.punch_count) > 0;

              return (
                <div className="space-y-4">
                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <Badge variant={isOnline ? 'default' : 'secondary'}>
                      {isOnline ? '🟢 Online' : '⚫ Offline'}
                    </Badge>
                    {hasCheckedIn && <Badge variant="outline" className="text-green-600">✅ Check-in</Badge>}
                    {selectedEmployee.worker_profile && (
                      <Badge variant="outline">{selectedEmployee.position || selectedEmployee.worker_profile}</Badge>
                    )}
                  </div>

                  {/* Info */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {selectedEmployee.location_updated_at && (
                      <div className="col-span-2 text-xs text-muted-foreground">
                        📡 Última atualização: {formatDistanceToNow(new Date(selectedEmployee.location_updated_at), { addSuffix: true, locale: ptBR })}
                      </div>
                    )}
                    {selectedEmployee.battery_level != null && (
                      <div className="text-xs">🔋 Bateria: {selectedEmployee.battery_level}%</div>
                    )}
                    {selectedEmployee.current_brands && (
                      <div className="text-xs">🏷️ Marcas: {selectedEmployee.current_brands}</div>
                    )}
                  </div>

                  {/* Routes today */}
                  {empRoutes.length > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> Rotas de hoje ({empRoutes.length})
                      </h4>
                      {empRoutes.map((r: any) => (
                        <Card key={r.id} className={r.status === 'in_progress' ? 'border-orange-500/30 bg-orange-500/5' : r.status === 'completed' ? 'border-green-500/20 bg-green-500/5' : ''}>
                          <CardContent className="p-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <div>
                                <div className="text-sm font-medium">{r.pdv_name}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {r.scheduled_time?.slice(0, 5)} • {r.brand_name}
                                  {r.checklist_name && ` • ${r.checklist_name}`}
                                </div>
                              </div>
                              <Badge className={`text-[9px] ${
                                r.status === 'in_progress' ? 'bg-orange-500/20 text-orange-700' :
                                r.status === 'completed' ? 'bg-green-500/20 text-green-700' :
                                'bg-blue-500/20 text-blue-700'
                              }`}>
                                {r.status === 'in_progress' ? 'Executando' : r.status === 'completed' ? 'Concluída' : 'Pendente'}
                              </Badge>
                            </div>
                            {(r.status === 'in_progress' || r.status === 'completed') && (
                              <div className="space-y-1">
                                <Progress value={r.progress_pct || 0} className="h-1" />
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>{r.completed_products || 0}/{r.total_products || 0} produtos</span>
                                  <span>{Math.round(r.progress_pct || 0)}%</span>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-4 bg-muted/30 rounded-md">
                      Nenhuma rota agendada para hoje
                    </div>
                  )}
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
