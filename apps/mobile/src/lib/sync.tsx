import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { SyncWorker } from '@/sync/worker'
import { pushRecord } from '@/sync/push'
import { pullSnapshot } from '@/sync/pull'
import type { SyncStatus } from '@/sync/types'
import { getStore } from '@/db'
import { getToken } from '@/api/client'
import { isOnline, subscribeNetInfo } from './netinfo'
import { queryClient } from './queryClient'

const TICK_MS = 30_000

interface SyncContextValue {
  status: SyncStatus
  syncNow: () => Promise<void>
  /** Apply a local mutation, refresh the UI immediately, then nudge a sync. */
  commit: <T>(fn: () => T) => T
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined)

// Wires the sync worker to the three triggers from PRD 0018 §4.5 — NetInfo
// reconnect, app-foreground, and a periodic tick — plus an initial sync at
// launch. The worker is the only thing that touches the network; screens read
// and write the local store and call `commit` to refresh + enqueue.
export function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>({
    phase: 'idle',
    pending: getStore().outbox.all().length,
    lastSyncedAt: getStore().meta.get<string>('last_synced_at') ?? null,
    lastError: null,
  })

  const workerRef = useRef<SyncWorker>()
  if (!workerRef.current) {
    workerRef.current = new SyncWorker({
      store: getStore(),
      push: pushRecord,
      pull: pullSnapshot,
      isOnline,
      onStatus: setStatus,
    })
  }
  const worker = workerRef.current

  const syncNow = useCallback(async () => {
    if (!getToken()) return // logged out — nothing to sync
    await worker.sync()
    queryClient.invalidateQueries()
  }, [worker])

  const commit = useCallback(
    <T,>(fn: () => T): T => {
      const result = fn()
      queryClient.invalidateQueries()
      void syncNow()
      return result
    },
    [syncNow],
  )

  useEffect(() => {
    void syncNow()
    const unsubNet = subscribeNetInfo((online) => {
      if (online) void syncNow()
    })
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow()
    })
    const tick = setInterval(() => void syncNow(), TICK_MS)
    return () => {
      unsubNet()
      appSub.remove()
      clearInterval(tick)
    }
  }, [syncNow])

  return <SyncContext.Provider value={{ status, syncNow, commit }}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
