import { env } from "../env.js"

type RenderDisk = {
  id: string
  name: string
  sizeGB: number
  mountPath: string
  serviceId: string
}

type RenderSnapshot = {
  id: string
  diskId: string
  status: string
  createdAt: string
  sizeGB: number
}

async function renderRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = `${env.render.apiBase}${path}`
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${env.render.apiKey}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Render API ${path} failed (${response.status}): ${text}`)
  }

  return response.json() as Promise<T>
}

/**
 * List all disks for a Render service
 */
export async function listRenderDisks(serviceId: string): Promise<RenderDisk[]> {
  const response = await renderRequest<{ cursor?: string; disk: RenderDisk }[]>(
    `/services/${serviceId}/disks`,
  )
  return response.map((entry) => entry.disk).filter(Boolean)
}

/**
 * Create a snapshot of a Render disk
 */
export async function createDiskSnapshot(diskId: string): Promise<RenderSnapshot> {
  console.log(`[render-backup] Creating snapshot for disk ${diskId}...`)
  const response = await renderRequest<{ snapshot: RenderSnapshot }>(`/disks/${diskId}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })
  console.log(`[render-backup] Snapshot created: ${response.snapshot.id}`)
  return response.snapshot
}

/**
 * List all snapshots for a disk
 */
export async function listDiskSnapshots(diskId: string): Promise<RenderSnapshot[]> {
  const response = await renderRequest<{ cursor?: string; snapshot: RenderSnapshot }[]>(
    `/disks/${diskId}/snapshots`,
  )
  return response.map((entry) => entry.snapshot).filter(Boolean)
}

/**
 * Delete a disk snapshot
 */
export async function deleteDiskSnapshot(diskId: string, snapshotId: string): Promise<void> {
  console.log(`[render-backup] Deleting snapshot ${snapshotId}...`)
  await renderRequest(`/disks/${diskId}/snapshots/${snapshotId}`, {
    method: "DELETE",
  })
  console.log(`[render-backup] Snapshot deleted: ${snapshotId}`)
}

/**
 * Restore a disk from a snapshot
 */
export async function restoreDiskFromSnapshot(diskId: string, snapshotId: string): Promise<void> {
  console.log(`[render-backup] Restoring disk ${diskId} from snapshot ${snapshotId}...`)
  await renderRequest(`/disks/${diskId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshotId }),
  })
  console.log(`[render-backup] Disk restored from snapshot ${snapshotId}`)
}

/**
 * Backup all disks for a worker by creating snapshots
 */
export async function backupWorkerDisks(serviceId: string): Promise<RenderSnapshot[]> {
  const disks = await listRenderDisks(serviceId)
  if (disks.length === 0) {
    console.log(`[render-backup] No disks found for service ${serviceId}`)
    return []
  }

  console.log(`[render-backup] Found ${disks.length} disk(s) for service ${serviceId}`)
  const snapshots: RenderSnapshot[] = []

  for (const disk of disks) {
    try {
      const snapshot = await createDiskSnapshot(disk.id)
      snapshots.push(snapshot)
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error"
      console.error(`[render-backup] Failed to backup disk ${disk.id}: ${message}`)
    }
  }

  return snapshots
}

/**
 * Rotate snapshots: keep only the N most recent snapshots per disk
 */
export async function rotateSnapshots(diskId: string, keepCount = 7): Promise<void> {
  const snapshots = await listDiskSnapshots(diskId)
  const sorted = snapshots.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const toDelete = sorted.slice(keepCount)
  if (toDelete.length === 0) {
    console.log(`[render-backup] No snapshots to rotate for disk ${diskId}`)
    return
  }

  console.log(`[render-backup] Rotating snapshots: keeping ${keepCount}, deleting ${toDelete.length}`)
  for (const snapshot of toDelete) {
    try {
      await deleteDiskSnapshot(diskId, snapshot.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error"
      console.error(`[render-backup] Failed to delete snapshot ${snapshot.id}: ${message}`)
    }
  }
}
