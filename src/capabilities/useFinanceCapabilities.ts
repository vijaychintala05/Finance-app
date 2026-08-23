import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';

export type CapabilityState = 'enabled' | 'disabled' | 'unavailable';

export interface FinanceCapability {
  key: string;
  label: string;
  state: CapabilityState;
  certified: boolean;
  reason?: string;
  prerequisite?: string;
}

interface CapabilityResponse {
  capabilities: FinanceCapability[];
}

export function useFinanceCapabilities() {
  const [capabilities, setCapabilities] = useState<FinanceCapability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient.get<CapabilityResponse>('/point1/capabilities').then((response) => {
      if (!active) return;
      setCapabilities(response.data?.capabilities || []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const byKey = useMemo(
    () => new Map(capabilities.map((capability) => [capability.key, capability])),
    [capabilities]
  );

  return {
    loading,
    capabilities,
    getCapability: (key: string) => byKey.get(key),
    isEnabled: (key: string) => byKey.get(key)?.state === 'enabled',
  };
}
