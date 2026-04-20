import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../services/apiClient';

export type DashboardParams = { anio: number; mes: number | null; idArea: number | null };

export function useDashboard(params: DashboardParams) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('anio', String(params.anio));
      if (params.mes != null) qs.set('mes', String(params.mes));
      if (params.idArea != null) qs.set('idArea', String(params.idArea));

      const res = await apiFetch(`/dashboard?${qs.toString()}`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [params.anio, params.mes, params.idArea]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load } as const;
}
