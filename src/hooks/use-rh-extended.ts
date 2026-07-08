import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ===== INDICATORS =====
export function useRhIndicators() {
  return useQuery({
    queryKey: ['rh-indicators'],
    queryFn: () => api<any>('/api/rh/indicators'),
    staleTime: 60_000,
  });
}

// ===== HEALTH EXAMS (ASO) =====
export function useHealthExams(filters?: { employee_id?: string; status?: 'vencido' | 'vencendo' }) {
  const params = new URLSearchParams();
  if (filters?.employee_id) params.set('employee_id', filters.employee_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['rh-health-exams', qs],
    queryFn: () => api<any[]>(`/api/rh/health-exams${qs ? `?${qs}` : ''}`),
  });
}
export function useSaveHealthExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      id ? api<any>(`/api/rh/health-exams/${id}`, { method: 'PUT', body })
         : api<any>('/api/rh/health-exams', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rh-health-exams'] }); qc.invalidateQueries({ queryKey: ['rh-indicators'] }); },
  });
}
export function useDeleteHealthExam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/health-exams/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rh-health-exams'] }); qc.invalidateQueries({ queryKey: ['rh-indicators'] }); },
  });
}

// ===== EPI CATALOG =====
export function useEpiCatalog() {
  return useQuery({ queryKey: ['epi-catalog'], queryFn: () => api<any[]>('/api/rh/epi-catalog') });
}
export function useSaveEpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      id ? api(`/api/rh/epi-catalog/${id}`, { method: 'PUT', body })
         : api('/api/rh/epi-catalog', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epi-catalog'] }),
  });
}
export function useDeleteEpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/epi-catalog/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epi-catalog'] }),
  });
}

// ===== EPI DELIVERIES =====
export function useEpiDeliveries(filters?: { employee_id?: string; status?: 'vencido' | 'vencendo' }) {
  const params = new URLSearchParams();
  if (filters?.employee_id) params.set('employee_id', filters.employee_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['epi-deliveries', qs],
    queryFn: () => api<any[]>(`/api/rh/epi-deliveries${qs ? `?${qs}` : ''}`),
  });
}
export function useSaveEpiDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      id ? api(`/api/rh/epi-deliveries/${id}`, { method: 'PUT', body })
         : api('/api/rh/epi-deliveries', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['epi-deliveries'] }); qc.invalidateQueries({ queryKey: ['epi-catalog'] }); qc.invalidateQueries({ queryKey: ['rh-indicators'] }); },
  });
}
export function useDeleteEpiDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/epi-deliveries/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['epi-deliveries'] }),
  });
}

// ===== WARNINGS =====
export function useWarnings(filters?: { employee_id?: string }) {
  const params = new URLSearchParams();
  if (filters?.employee_id) params.set('employee_id', filters.employee_id);
  const qs = params.toString();
  return useQuery({ queryKey: ['warnings', qs], queryFn: () => api<any[]>(`/api/rh/warnings${qs ? `?${qs}` : ''}`) });
}
export function useCreateWarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api('/api/rh/warnings', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warnings'] }); qc.invalidateQueries({ queryKey: ['rh-indicators'] }); },
  });
}
export function useAcknowledgeWarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/warnings/${id}/acknowledge`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warnings'] }),
  });
}
export function useDeleteWarning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/warnings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warnings'] }),
  });
}

// ===== TRAININGS =====
export function useTrainingsCatalog() {
  return useQuery({ queryKey: ['trainings-catalog'], queryFn: () => api<any[]>('/api/rh/trainings-catalog') });
}
export function useSaveTrainingCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api('/api/rh/trainings-catalog', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainings-catalog'] }),
  });
}
export function useDeleteTrainingCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/trainings-catalog/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainings-catalog'] }),
  });
}
export function useEmployeeTrainings(filters?: { employee_id?: string; status?: 'vencido' | 'vencendo' }) {
  const params = new URLSearchParams();
  if (filters?.employee_id) params.set('employee_id', filters.employee_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return useQuery({ queryKey: ['employee-trainings', qs], queryFn: () => api<any[]>(`/api/rh/employee-trainings${qs ? `?${qs}` : ''}`) });
}
export function useSaveEmployeeTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api('/api/rh/employee-trainings', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee-trainings'] }); qc.invalidateQueries({ queryKey: ['rh-indicators'] }); },
  });
}
export function useDeleteEmployeeTraining() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/employee-trainings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-trainings'] }),
  });
}
