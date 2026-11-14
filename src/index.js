/**
 * dsh-better-workspace — host half (plain JavaScript, no build step).
 *
 * The feature lives in the client half (src/client.js): the hierarchy tree,
 * the add-workspace flow, and view state (persisted in the browser through the
 * dsh client store). This host half exists so the cordis plugin row has a
 * valid Node entry and so Config metadata is available to the Loader.
 */
import { registerTitleSource } from './title-source.js'

export const name = 'dsh-better-workspace'

/**
 * The schemastery module, resolved LAZILY: it is a PEER, so a profile whose
 * node_modules does not hoist it — the desktop app's bundled runtime, or any
 * install that resolved the peers elsewhere — would otherwise fail the static
 * import at the top of this file. The Loader treats a failed plugin import as
 * a non-fatal skip (ctx.logger.error + no fiber), so the row silently never
 * mounted: no host half, no dsh.client scan, no client bundle in the boot
 * graph, and the official sidebar quietly took the seat — the same
 * all-green-log failure class as issue #9. Deferring the import hides the
 * schema where the module is absent instead of killing the row. Null when
 * unresolvable.
 */
let Schema = null
try {
  Schema = (await import('@deepseek-ai/schemastery')).default
} catch (error) {
  Schema = null
  console.warn(
    '[dsh-better-workspace] @deepseek-ai/schemastery is not resolvable here; the row Config surface is absent'
    + ' (the browser features do not depend on it): ' + (error && error.message || String(error)),
  )
}

/**
 * Row Config = the settings surface on dsh >= 0.2.2-rc.1. Values persist in
 * this profile's plugin patch; the shared-settings-home era is gone. Every
 * field is volatile so the settings card can live-edit it without a remount.
 * Absent when schemastery is unresolvable (cordis then passes the row config
 * through unvalidated; the browser half reads every value with its own
 * fallbacks either way).
 */
export const Config = Schema === null
  ? undefined
  : Schema.object({
    compactChains: Schema.boolean().default(true).volatile(),
    statusPulse: Schema.boolean().default(true).volatile(),
    styling: Schema.dict(Schema.any()).default({}).volatile(),
    appearance: Schema.dict(Schema.any()).default({}).volatile(),
  })

/*
 * NO `export const inject` — deliberately.
 *
 * Cordis normalizes a plugin's `inject` through `Inject.resolve`, and that
 * function only understands two shapes: an ARRAY of service names, or an
 * OBJECT read as a name → intercept-config map. There is no
 * `{ required, optional }` form in this build. The previous
 * `{ optional: ['sessionProjections'] }` therefore asked for a service
 * literally named "optional"; no fiber provides it, so `_refresh()` keeps the
 * fiber epoch at INACTIVE, `_setEpoch` sees no change, and the fiber stays in
 * state 0 = PENDING forever: the plugin card reads "waiting for dependencies"
 * (zh 等待依赖), `apply` never runs, no Config surface and no title
 * projection. A hard array inject would pend the same way whenever the service
 * is absent.
 *
 * The optional consumer is a child fiber created with `ctx.inject` instead:
 * only that child waits for the service, the row itself activates immediately,
 * and `registerTitleSource`'s "service absent" fallback stays reachable.
 */
export async function apply(ctx) {
  const log = ctx && ctx.logger && typeof ctx.logger.info === 'function'
    ? (msg) => ctx.logger.info(msg)
    : (msg) => console.log(msg)
  const attempt = async (scoped) => {
    const registered = await registerTitleSource(scoped, log)
    log('[dsh-better-workspace] host half loaded; UI runs in the browser (client half)'
      + (registered ? '; session title provenance projection registered' : '; title provenance unavailable'))
  }
  // Real host context: the soft child fiber owns the wait, the row does not.
  if (ctx && typeof ctx.inject === 'function') {
    ctx.inject(['sessionProjections'], attempt)
    log('[dsh-better-workspace] host half loaded; the browser half carries the UI; '
      + 'session title provenance waits on the optional sessionProjections service')
    return
  }
  // Plain contexts (tests, harnesses without the service API): best effort now.
  await attempt(ctx)
}
