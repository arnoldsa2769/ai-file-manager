import { useEffect, useRef, useState } from 'react';
import type { Collection, Collections, PageOptions } from '../../../packages/core/src/types.js';
import type { WorkspaceClient } from '../../../packages/sdk/src/index.js';

export interface PageState<T> {
  items: T[];
  nextCursor: string | null;
  loading: boolean;
  error: string;
  loadMore: () => Promise<void>;
  retry: () => void;
}
export function usePage<K extends Collection>(
  client: WorkspaceClient,
  wid: string,
  collection: K,
  options: PageOptions,
  generation: number,
  enabled = true,
): PageState<Collections[K]> {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([wid, collection, options, generation, enabled, attempt]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const [state, setState] = useState<{
    key: string;
    items: Collections[K][];
    nextCursor: string | null;
    loading: boolean;
    error: string;
  }>({ key: '', items: [], nextCursor: null, loading: true, error: '' });
  const inFlight = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    let active = true;
    epoch.current += 1;
    inFlight.current = false;
    if (!enabled) return;
    setState({ key, items: [], nextCursor: null, loading: true, error: '' });
    void client
      .page(wid, collection, options)
      .then((page) => {
        if (active && currentKey.current === key)
          setState({ key, ...page, loading: false, error: '' });
      })
      .catch((error: Error) => {
        if (active && currentKey.current === key)
          setState({ key, items: [], nextCursor: null, loading: false, error: error.message });
      });
    return () => {
      active = false;
      epoch.current += 1;
    };
  }, [client, key]);
  const visible =
    state.key === key && enabled
      ? state
      : { items: [], nextCursor: null, loading: enabled, error: '' };
  return {
    ...visible,
    retry: () => setAttempt((n) => n + 1),
    loadMore: async () => {
      if (inFlight.current || visible.loading || !visible.nextCursor) return;
      const requestEpoch = epoch.current;
      inFlight.current = true;
      setState((s) => ({ ...s, loading: true, error: '' }));
      try {
        const page = await client.page(wid, collection, { ...options, cursor: visible.nextCursor });
        if (currentKey.current === key && epoch.current === requestEpoch)
          setState((s) => ({
            key,
            items: [...s.items, ...page.items],
            nextCursor: page.nextCursor,
            loading: false,
            error: '',
          }));
      } catch (error) {
        if (currentKey.current === key && epoch.current === requestEpoch)
          setState((s) => ({
            ...s,
            loading: false,
            error: error instanceof Error ? error.message : 'Could not load the next page.',
          }));
      } finally {
        if (currentKey.current === key && epoch.current === requestEpoch) inFlight.current = false;
      }
    },
  };
}

export function useResource<T>(
  identity: string | null,
  generation: number,
  load: () => Promise<T>,
) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([identity, generation, attempt]);
  const loader = useRef(load);
  loader.current = load;
  const [state, setState] = useState<{ key: string; data?: T; error: string; loading: boolean }>({
    key: '',
    error: '',
    loading: false,
  });
  useEffect(() => {
    let active = true;
    if (!identity) return;
    setState({ key, error: '', loading: true });
    void loader
      .current()
      .then((data) => {
        if (active) setState({ key, data, error: '', loading: false });
      })
      .catch((error: Error) => {
        if (active) setState({ key, error: error.message, loading: false });
      });
    return () => {
      active = false;
    };
  }, [key]);
  const visible =
    state.key === key && identity
      ? state
      : { data: undefined, error: '', loading: Boolean(identity) };
  return { ...visible, retry: () => setAttempt((n) => n + 1) };
}
