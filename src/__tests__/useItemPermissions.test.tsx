// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useItemPermissions } from '../permissions/useItemPermissions';

const allowed = { itemsView: true, itemsCreate: true, itemsEdit: true, itemsArchive: false };
const denied = { itemsView: false, itemsCreate: false, itemsEdit: false, itemsArchive: false };

describe('useItemPermissions organization scoping', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ignores a delayed prior-organization grant after an organization switch', async () => {
    let resolveA!: (value: any) => void;
    let resolveB!: (value: any) => void;
    const requestA = new Promise((resolve) => { resolveA = resolve; });
    const requestB = new Promise((resolve) => { resolveB = resolve; });
    vi.spyOn(apiClient, 'get').mockImplementation((_endpoint: string, organizationId?: string) =>
      (organizationId === 'org-a' ? requestA : requestB) as any
    );

    const { result, rerender } = renderHook(
      ({ organizationId }) => useItemPermissions(organizationId),
      { initialProps: { organizationId: 'org-a' } }
    );
    rerender({ organizationId: 'org-b' });
    act(() => resolveB({ data: { organizationId: 'org-b', actions: denied }, error: null, status: 200 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.organizationId).toBe('org-b');
    expect(result.current.actions.itemsView).toBe(false);

    act(() => resolveA({ data: { organizationId: 'org-a', actions: allowed }, error: null, status: 200 }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.organizationId).toBe('org-b');
    expect(result.current.actions.itemsView).toBe(false);
  });

  it('settles a failed manifest as denied access with an error', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: null, error: 'Authorization unavailable', status: 503 } as any);
    const { result } = renderHook(() => useItemPermissions('org-a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.actions).toEqual(denied);
    expect(result.current.organizationId).toBeUndefined();
    expect(result.current.error).toBe('Authorization unavailable');
  });
});
