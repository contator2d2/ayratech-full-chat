import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ============ DEPENDENTES ============
export function useDependents(employeeId?: string) {
  return useQuery({
    queryKey: ['rh-dependents', employeeId],
    queryFn: () => api<any[]>(`/api/rh/dependents/${employeeId}`),
    enabled: !!employeeId,
  });
}
export function useSaveDependent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      id ? api(`/api/rh/dependents/${id}`, { method: 'PUT', body })
         : api('/api/rh/dependents', { method: 'POST', body }),
    onSuccess: (_d, v: any) => qc.invalidateQueries({ queryKey: ['rh-dependents', v.employee_id] }),
  });
}
export function useDeleteDependent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/rh/dependents/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh-dependents'] }),
  });
}

// ============ ADMISSÃO ============
export function useFinalizeAdmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api('/api/rh/admission', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rh-employees'] });
      qc.invalidateQueries({ queryKey: ['rh-indicators'] });
      qc.invalidateQueries({ queryKey: ['rh-esocial'] });
    },
  });
}

// ============ DEMISSÃO ============
export function useTerminationPreview() {
  return useMutation({
    mutationFn: (body: any) => api<any>('/api/rh/termination/preview', { method: 'POST', body }),
  });
}
export function useCreateTermination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api('/api/rh/termination', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rh-employees'] });
      qc.invalidateQueries({ queryKey: ['rh-terminations'] });
      qc.invalidateQueries({ queryKey: ['rh-indicators'] });
      qc.invalidateQueries({ queryKey: ['rh-esocial'] });
    },
  });
}
export function useTerminations() {
  return useQuery({ queryKey: ['rh-terminations'], queryFn: () => api<any[]>('/api/rh/terminations') });
}

// ============ eSOCIAL ============
export function useEsocialEvents(filters?: { status?: string; event_type?: string; employee_id?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.event_type) params.set('event_type', filters.event_type);
  if (filters?.employee_id) params.set('employee_id', filters.employee_id);
  const qs = params.toString();
  return useQuery({
    queryKey: ['rh-esocial', qs],
    queryFn: () => api<any[]>(`/api/rh/esocial${qs ? `?${qs}` : ''}`),
  });
}
export function useGenerateEsocialXml() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ xml: string }>(`/api/rh/esocial/${id}/generate-xml`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh-esocial'] }),
  });
}
export function useMarkEsocialSent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) => api(`/api/rh/esocial/${id}/mark-sent`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh-esocial'] }),
  });
}
