import { useState, useEffect, useCallback } from 'react';

interface UseFormDraftOptions<T> {
  key: string;
  initialValues: T;
  enabled?: boolean;
}

export function useFormDraft<T extends Record<string, any>>({
  key,
  initialValues,
  enabled = true,
}: UseFormDraftOptions<T>) {
  const storageKey = `form_draft_${key}`;

  const [formData, setFormData] = useState<T>(() => {
    if (!enabled) return initialValues;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return { ...initialValues, ...JSON.parse(saved) };
      }
    } catch {
      // ignore JSON parse errors
    }
    return initialValues;
  });

  const [hasDraft, setHasDraft] = useState<boolean>(() => {
    if (!enabled) return false;
    try {
      return localStorage.getItem(storageKey) !== null;
    } catch {
      return false;
    }
  });

  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Sync to localStorage on update
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(formData));
      setHasDraft(true);
    } catch {
      // ignore storage errors
    }
  }, [formData, enabled, storageKey]);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(initialValues);
    setIsDirty(false);
    setHasDraft(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [initialValues, storageKey]);

  const clearDraft = useCallback(() => {
    setHasDraft(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return {
    formData,
    setFormData,
    updateField,
    resetForm,
    clearDraft,
    hasDraft,
    isDirty,
  };
}
