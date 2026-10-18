import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useFinancialData<T>(fetcher: () => Promise<T>, enabled: boolean = true) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref to fetcher to prevent infinite loop when anonymous functions are passed
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const response: any = await fetcherRef.current();
      setData(response?.data ?? response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (enabled) {
        load();
      }
    }, [enabled, load])
  );

  return { data, isLoading, error, reload: load };
}