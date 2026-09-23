import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { WorkspaceSyncResult } from '@dhd/shared'

/**
 * Minimal client for the harness host's Typert-over-HTTP RPC surface:
 * POST /api/<namespace>/<method> with a ClientRequest envelope, authenticated
 * by the browser cookie minted from the launch token.
 */
export class HarnessApi {
  private cookie: string | undefined
  private auth: Promise<void> | undefined

  constructor(
    private readonly origin: string,
    private readonly token: string,
  ) {}

  private async ensureAuth(): Promise<void> {
    this.auth ??= (async () => {
      const res = await fetch(`${this.origin}/?token=${encodeURIComponent(this.token)}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      })
      const cookies = res.headers.getSetCookie?.() ?? []
      const pair = cookies
        .map((raw) => raw.split(';', 1)[0] ?? '')
        .find((kv) => kv.includes('='))
      if (!pair) throw new Error('harness host did not issue a session cookie (is the launch token valid?)')
      this.cookie = pair
    })().catch((err) => {
      this.auth = undefined
      throw err
    })
    return this.auth
  }

  /** Invoke one Remote method; throws with the harness error code on failure. */
  async call<T>(namespace: string, method: string, payload: object): Promise<T> {
    await this.ensureAuth()
    const rpcId = randomUUID()
    const endpoint = `${namespace}/${method}`
    const res = await fetch(`${this.origin}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: this.cookie ?? '',
      },
      // Typert Gateway wire form: payload.args is a plain object keyed by the
      // generated parameter wire names (both methods below use `request`).
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: endpoint,
        payload: { args: { request: payload } },
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`harness rpc ${endpoint}: HTTP ${res.status}`)
    const body = (await res.json()) as {
      type: string
      rpcId: string
      result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }
    }
    if (body.type !== 'server-response' || body.rpcId !== rpcId) {
      throw new Error(`harness rpc ${endpoint}: malformed response`)
    }
    if (!body.result.ok) {
      throw new Error(`harness rpc ${endpoint}: ${body.result.error.code}: ${body.result.error.message}`)
    }
    return body.result.value
  }

  /**
   * Register `path` as a workspace and resolve a session that shows it,
   * mirroring the web client's connect flow.
   */
  async openWorkspace(path: string): Promise<WorkspaceSyncResult> {
    const created = await this.call<{ workspace: { workspaceId: string; sessionIds: string[] }; created: boolean }>(
      'workspace', 'create', { path })
    const { workspaceId, sessionIds } = created.workspace
    let sessionId = sessionIds[0]
    if (!sessionId) {
      const session = await this.call<{ sessionId: string }>('session', 'create', { workspaceId })
      sessionId = session.sessionId
    }
    return { workspaceId, sessionId, created: created.created }
  }
}

function findHarnessFrame(wc: WebContents, origin: string): Electron.WebFrameMain | undefined {
  const visit = (frame: Electron.WebFrameMain): Electron.WebFrameMain | undefined => {
    for (const child of frame.frames) {
      if (child.url.startsWith(origin)) return child
      const nested = visit(child)
      if (nested) return nested
    }
    return undefined
  }
  return visit(wc.mainFrame)
}

/**
 * Point the harness web app at `sessionId` by writing its persisted selection
 * store and reloading the iframe. The store format is the raw snapshot JSON
 * (`dsh.sessions.current`, see harness client/store attachPersistence).
 */
export function seedHarnessSession(wc: WebContents, origin: string, sessionId: string): Promise<boolean> {
  const frame = findHarnessFrame(wc, origin)
  if (!frame) return Promise.resolve(false)
  const script = `(function () {
    var want = ${JSON.stringify(JSON.stringify({ sessionId }))};
    var raw = null;
    try { raw = localStorage.getItem('dsh.sessions.current') } catch (e) {}
    if (raw === want) return 'current';
    try { localStorage.setItem('dsh.sessions.current', want) } catch (e) { return 'error' }
    location.reload();
    return 'seeded';
  })()`
  return frame.executeJavaScript(script, false).then(
    (result: unknown) => result === 'seeded' || result === 'current',
  )
}
