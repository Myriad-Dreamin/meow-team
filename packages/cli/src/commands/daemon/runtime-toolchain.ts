import { spawnSync } from 'node:child_process'

export interface NodePathFromPidResult {
  nodePath: string | null
  error?: string
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function resolveNodePathFromPid(pid: number): NodePathFromPidResult {
  const result = spawnSync('ps', ['-o', 'comm=', '-p', String(pid)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.error) {
    return {
      nodePath: null,
      error: `ps failed: ${normalizeError(result.error)}`,
    }
  }

  if ((result.status ?? 1) !== 0) {
    const details = result.stderr?.trim()
    return {
      nodePath: null,
      error: details ? `ps failed: ${details}` : `ps exited with code ${result.status ?? 1}`,
    }
  }

  const resolved = result.stdout.trim()
  if (!resolved) {
    return {
      nodePath: null,
      error: 'ps returned an empty command path',
    }
  }

  return { nodePath: resolved }
}

