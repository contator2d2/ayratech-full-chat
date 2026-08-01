import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, API_URL } from '@/lib/api';

export interface OnboardingField { key: string; label: string; type: string }

export interface OnboardingLink {
  id: string;
  employee_id: string | null;
  employee_name?: string | null;
  candidate_name: string | null;
  token: string;
  access_key: string;
  requested_fields: string[];
  requested_docs: string[];
  status: 'pending' | 'submitted' | 'applied' | 'revoked';
  submitted_data: Record<string, string>;
  submitted_docs: { doc_type: string; title: string; file_url: string }[];
  message: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  applied_at: string | null;
  created_at: string;
}

export function buildOnboardingUrl(link: { token: string; access_key: string }) {
  return `${window.location.origin}/cadastro-colaborador/${link.token}?key=${link.access_key}`;
}

export function useOnboardingCatalog() {
  return useQuery({
    queryKey: ['rh-onboarding-catalog'],
    queryFn: () => api<{ fields: OnboardingField[]; default_docs: string[] }>('/api/rh/onboarding/catalog'),
    staleTime: 60 * 60 * 1000,
  });
}

export function useOnboardingLinks(filters?: { employee_id?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.employee_id) params.set('employee_id', filters.employee_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return useQuery({
    queryKey: ['rh-onboarding-links', qs],
    queryFn: () => api<OnboardingLink[]>(`/api/rh/onboarding/links${qs ? `?${qs}` : ''}`),
  });
}

export function useCreateOnboardingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      employee_id?: string | null;
      candidate_name?: string | null;
      requested_fields: string[];
      requested_docs: string[];
      message?: string;
      expires_in_days?: number;
    }) => api<OnboardingLink>('/api/rh/onboarding/links', { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh-onboarding-links'] }),
  });
}

export function useRevokeOnboardingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<OnboardingLink>(`/api/rh/onboarding/links/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh-onboarding-links'] }),
  });
}

export function useApplyOnboardingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; accept_fields?: string[]; accept_docs?: string[]; review_notes?: string }) =>
      api<any>(`/api/rh/onboarding/links/${id}/apply`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rh-onboarding-links'] });
      qc.invalidateQueries({ queryKey: ['rh-employees'] });
      qc.invalidateQueries({ queryKey: ['rh-documents'] });
    },
  });
}

export function useFollowupOnboardingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; requested_fields: string[]; requested_docs: string[]; message?: string; expires_in_days?: number }) =>
      api<OnboardingLink>(`/api/rh/onboarding/links/${id}/followup`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh-onboarding-links'] }),
  });
}

// ===== Público (sem autenticação) =====
const publicBase = (path: string) => `${API_URL || ''}/api/public/rh-onboarding${path}`;

export async function fetchPublicOnboarding(token: string, key: string) {
  const res = await fetch(publicBase(`/${token}?key=${encodeURIComponent(key)}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao carregar formulário');
  return data as {
    status: string;
    candidate_name: string | null;
    message: string | null;
    organization_name: string | null;
    expires_at: string | null;
    requested_fields: OnboardingField[];
    requested_docs: string[];
    submitted_data: Record<string, string>;
    submitted_docs: { doc_type: string; title: string; file_url: string }[];
  };
}

export async function uploadPublicOnboardingFile(token: string, key: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(publicBase(`/${token}/upload?key=${encodeURIComponent(key)}`), { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao enviar arquivo');
  return data.file.url as string;
}

export async function submitPublicOnboarding(
  token: string,
  key: string,
  payload: { data: Record<string, string>; docs: { doc_type: string; title: string; file_url: string }[] }
) {
  const res = await fetch(publicBase(`/${token}/submit`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Erro ao enviar cadastro');
  return data;
}
