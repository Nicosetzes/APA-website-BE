// Hook de la actualización de ratings al escribir un resultado (etapa 3).
//
// Política de fallos (crítica): el hook NUNCA rechaza ni lanza. La escritura del
// usuario ya se confirmó cuando se lo llama y su respuesta HTTP no puede
// cambiar por culpa de esto. Un sync perdido (error, timeout, diff grande) es
// seguro: el chequeo de frescura de la etapa 2 hace que los lectores caigan al
// camino en vivo (`source: live`) con la respuesta igualmente correcta.
//
// Lee la configuración en CADA llamada (kill switch `RATING_SYNC_ON_WRITE`).
// Emite UN log `rating_sync` por llamada, sin ids ni datos personales.
const zeroSection = () => ({ insert: 0, update: 0, delete: 0 })
const zeroChanges = () => ({ events: zeroSection(), players: zeroSection() })

const WARN_RESULTS = ["timeout", "error"]

const createRatingSyncHook = ({
    coordinator,
    getSettings,
    logger,
    isDatabaseReady,
    clock = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
}) => {
    const emit = (outcome, trigger, startedAt) => {
        try {
            const fields = {
                result: outcome.result,
                reason: outcome.reason ?? null,
                changes: outcome.changes ?? zeroChanges(),
                ratedMatches: outcome.ratedMatches ?? null,
                durationMs: Math.max(0, clock() - startedAt),
                trigger: trigger ?? null,
            }
            if (outcome.passes > 1) fields.passes = outcome.passes
            const level = WARN_RESULTS.includes(outcome.result)
                ? "warn"
                : "info"
            logger[level]("rating_sync", fields)
        } catch {
            // Un logger que falla no puede romper la escritura del usuario.
        }
    }

    // Resuelve con el resultado del coordinador o, si antes vence el
    // presupuesto, con `timeout`. El trabajo en curso sigue, pero corta solo en
    // el próximo límite de tanda por su propio deadline.
    const raceWithBudget = (timeoutMs) => {
        let timer = null
        const budget = new Promise((resolve) => {
            timer = setTimer(
                () =>
                    resolve({
                        result: "timeout",
                        reason: "budget_exceeded",
                        changes: zeroChanges(),
                        ratedMatches: null,
                        passes: 0,
                    }),
                timeoutMs
            )
            timer?.unref?.()
        })
        const work = Promise.resolve().then(() => coordinator.request())
        return Promise.race([work, budget]).finally(() => clearTimer(timer))
    }

    return async ({ trigger } = {}) => {
        const startedAt = clock()
        let outcome
        try {
            const settings = getSettings()
            if (!settings.enabled) {
                outcome = {
                    result: "disabled",
                    reason: "env_off",
                    changes: zeroChanges(),
                    ratedMatches: null,
                    passes: 0,
                }
            } else if (!isDatabaseReady()) {
                // Solo ocurre en tests unitarios sin conexión: sin log ni lecturas.
                return {
                    result: "skipped",
                    reason: "database_not_connected",
                }
            } else {
                outcome = await raceWithBudget(settings.timeoutMs)
            }
        } catch (error) {
            outcome = {
                result: "error",
                reason: (error && error.name) || "Error",
                changes: zeroChanges(),
                ratedMatches: null,
                passes: 0,
            }
        }
        emit(outcome, trigger, startedAt)
        return outcome
    }
}

module.exports = { createRatingSyncHook }
