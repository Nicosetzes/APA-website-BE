const {
    describeChanges,
    diffAgainstStored,
    loadRatingsState,
    sameSourceStats,
} = require("../ratingsStore")

// Una sincronización de los ratings persistidos (etapa 3): el MISMO pipeline que
// `npm run recompute:ratings` (service/ratingsStore/pipeline), pero con un tope
// de cambios y un presupuesto de tiempo, y aplicando solo el diff.
//
// Módulo puro: las lecturas y la escritura se inyectan. No requiere mongoose,
// modelos ni DAOs (el cableado real está en service/syncRatingsAfterWrite).

// Pasadas extra si el origen cambió mientras se aplicaba (una escritura que
// llegó durante la corrida). Acotado: no es un bucle abierto.
const MAX_EXTRA_PASSES = 2

const zeroSection = () => ({ insert: 0, update: 0, delete: 0 })
const zeroChanges = () => ({ events: zeroSection(), players: zeroSection() })

const addChanges = (target, changes) => {
    for (const collection of ["events", "players"]) {
        for (const operation of ["insert", "update", "delete"]) {
            target[collection][operation] += changes[collection][operation]
        }
    }
}

const publicChanges = ({ events, players }) => ({ events, players })

const createRatingsSyncRunner = ({
    loadSourceStats,
    loadMatches,
    findStored,
    applyDiff,
    getSettings,
    now = () => new Date(),
    clock = Date.now,
}) => {
    // `run()` devuelve `{ result, reason, changes, ratedMatches, passes }`.
    //
    // - `noop`: nada que cambiar (lo guardado ya coincide).
    // - `applied`: se escribió el diff. `changes` acumula lo aplicado en todas
    //   las pasadas. `reason: "source_changed"` si, agotadas las pasadas extra,
    //   el origen seguía cambiando.
    // - `skipped` / `large_diff`: el diff supera `maxChanges`; no se escribió
    //   nada y `changes` cuenta lo NO aplicado. Lo resuelve el script.
    // - `timeout` / `deadline`: se agotó el presupuesto. Entre eventos y
    //   jugadores el corte es seguro (ver dao/applyRatingDiff). Si cortó
    //   durante el apply, `changes` cuenta lo que se intentaba aplicar.
    //
    // Los errores de cualquier dependencia se propagan (los convierte el
    // coordinador).
    const run = async () => {
        const settings = getSettings()
        const deadline = clock() + settings.timeoutMs
        const shouldContinue = () => clock() < deadline
        const applied = zeroChanges()
        let appliedTotal = 0
        let passes = 0
        let ratedMatches = null

        const outcome = (result, reason, changes) => ({
            result,
            reason,
            changes: publicChanges(changes),
            ratedMatches,
            passes,
        })

        for (;;) {
            if (passes > 0 && !shouldContinue()) {
                return outcome("timeout", "deadline", applied)
            }
            passes += 1
            const { sourceStats, state } = await loadRatingsState({
                loadSourceStats,
                loadMatches,
                now,
            })
            ratedMatches = sourceStats.ratedMatches
            const { diff } = await diffAgainstStored(state, findStored)
            const changes = describeChanges(diff)

            if (changes.total === 0) {
                return appliedTotal > 0
                    ? outcome("applied", null, applied)
                    : outcome("noop", null, applied)
            }
            if (changes.total > settings.maxChanges) {
                return outcome("skipped", "large_diff", changes)
            }
            if (!shouldContinue()) {
                return outcome("timeout", "deadline", changes)
            }

            const result = await applyDiff(diff, { shouldContinue })
            if (result?.cancelled) {
                return outcome("timeout", "deadline", changes)
            }
            addChanges(applied, changes)
            appliedTotal += changes.total

            // Si el origen cambió mientras se escribía, lo guardado ya nació
            // viejo: otra pasada (acotada) lo deja al día.
            const after = await loadSourceStats()
            if (sameSourceStats(sourceStats, after)) {
                return outcome("applied", null, applied)
            }
            if (passes > MAX_EXTRA_PASSES) {
                return outcome("applied", "source_changed", applied)
            }
        }
    }

    return run
}

module.exports = { MAX_EXTRA_PASSES, createRatingsSyncRunner }
