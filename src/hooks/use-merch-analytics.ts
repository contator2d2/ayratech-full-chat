import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type DashboardFilters = Record<string, string | undefined>;

function buildQS(filters?: DashboardFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) { if (v) params.set(k, v); }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useMerchDashboard(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-dashboard', qs],
    queryFn: () => api<any>(`/api/merch-analytics/dashboard${qs}`),
  });
}

export function useMerchReportPDV(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-report-pdv', qs],
    queryFn: () => api<any[]>(`/api/merch-analytics/report/pdv${qs}`),
  });
}

export function useMerchReportBrand(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-report-brand', qs],
    queryFn: () => api<any[]>(`/api/merch-analytics/report/brand${qs}`),
  });
}

export function useMerchReportPromoter(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-report-promoter', qs],
    queryFn: () => api<any[]>(`/api/merch-analytics/report/promoter${qs}`),
  });
}

export function useMerchReportProduct(filters?: DashboardFilters & { product_id?: string }) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-report-product', qs],
    queryFn: async () => {
      try {
        return await api<any[]>(`/api/merch-analytics/report/product${qs}`, { silent: true });
      } catch {
        return [];
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useMerchReportCategory(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-report-category', qs],
    queryFn: () => api<any[]>(`/api/merch-analytics/report/category${qs}`),
  });
}

export function useMerchRoutesTimeline(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-routes-timeline', qs],
    queryFn: () => api<any[]>(`/api/merch-analytics/charts/routes-timeline${qs}`),
  });
}

export function useMerchAlerts() {
  return useQuery({
    queryKey: ['merch-analytics-alerts'],
    queryFn: () => api<any[]>(`/api/merch-analytics/alerts`),
  });
}

export function useMerchAnalytical(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-analytical', qs],
    queryFn: () => api<{ summary: any; rows: any[] }>(`/api/merch-analytics/analytical${qs}`),
  });
}

export function useMerchRankingIssues(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-ranking-issues', qs],
    queryFn: async () => {
      try {
        return await api<any[]>(`/api/merch-analytics/ranking/issues${qs}`, { silent: true });
      } catch {
        return [];
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}



export function useMerchReportStockouts(filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-report-stockouts', qs],
    queryFn: () => api<any[]>(`/api/merch-analytics/report/stockouts${qs}`),
  });
}

export function useMerchBrandRecord(brandId: string | null, filters?: DashboardFilters) {
  const qs = buildQS(filters);
  return useQuery({
    queryKey: ['merch-analytics-brand-record', brandId, qs],
    queryFn: () => api<any>(`/api/merch-analytics/brand-record/${brandId}${qs}`),
    enabled: !!brandId,
  });
}
