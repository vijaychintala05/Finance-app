import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export interface ItemActionPermissions {
  itemsView: boolean;
  itemsCreate: boolean;
  itemsEdit: boolean;
  itemsArchive: boolean;
}

interface PermissionResponse {
  organizationId: string;
  actions: ItemActionPermissions;
}

const denied: ItemActionPermissions = { itemsView: false, itemsCreate: false, itemsEdit: false, itemsArchive: false };

export function useItemPermissions(organizationId: string, enabled = true) {
  const [response, setResponse] = useState<PermissionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    setResponse(null);
    setError(null);
    setLoading(true);
    if (!enabled || !organizationId) {
      setLoading(false);
      return () => { active = false; };
    }

    apiClient.get<PermissionResponse>('/organizations/current/permissions', organizationId).then((result) => {
      if (!active) return;
      if (result.error || result.data?.organizationId !== organizationId || !result.data.actions) {
        setError(result.error || 'Organization permissions could not be verified.');
        setResponse(null);
      } else {
        setResponse(result.data);
      }
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Organization permissions could not be verified.');
      setResponse(null);
      setLoading(false);
    });

    return () => { active = false; };
  }, [organizationId, generation, enabled]);

  const current = response?.organizationId === organizationId;
  return {
    loading: enabled && (loading || (!current && !error)),
    error,
    organizationId: current ? response.organizationId : undefined,
    actions: current ? response.actions : denied,
    refresh: () => setGeneration((value) => value + 1),
  };
}
