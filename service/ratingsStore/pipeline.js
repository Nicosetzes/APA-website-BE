const { computeRatingsState } = require("./computeState")
const { diffRatingDocuments } = require("./diff")

// Orquestación compartida de "leer el origen, recalcular y comparar contra lo
// guardado". La usan `scripts/lib/ratingsStoreCli.js` (recompute y verify) y la
// actualización al escribir (service/ratingsSync), de modo que hay UNA sola
// implementación del pipeline.
//
// Módulo puro: las lecturas se inyectan; no requiere mongoose, modelos ni DAOs.

// Orden a propósito: primero las stats y después el historial. Si se cuela una
// escritura entre ambas lecturas, el `source` guardado queda más viejo que los
// datos usados y el read-model parece desactualizado (seguro). Al revés podría
// declararse fresco algo calculado con datos viejos.
const loadRatingsState = async ({
    loadSourceStats,
    loadMatches,
    now = () => new Date(),
}) => {
    const sourceStats = await loadSourceStats()
    const matches = await loadMatches()
    const state = computeRatingsState(matches, {
        now: now(),
        sourceStats,
    })
    return { sourceStats, state }
}

// Lee lo guardado de la `ratingVersion` del estado y lo compara con lo
// recalculado.
const diffAgainstStored = async (state, findStored) => {
    const stored = await findStored(state.ratingVersion)
    const diff = diffRatingDocuments(state.computed, stored)
    return { stored, diff }
}

const sectionCounts = (section) => ({
    insert: section.insert.length,
    update: section.update.length,
    delete: section.delete.length,
})

// Cantidad de documentos por colección y operación, y el total.
const describeChanges = (diff) => {
    const events = sectionCounts(diff.events)
    const players = sectionCounts(diff.players)
    return {
        events,
        players,
        total:
            events.insert +
            events.update +
            events.delete +
            players.insert +
            players.update +
            players.delete,
    }
}

const timeOf = (date) =>
    date === null || date === undefined ? null : new Date(date).getTime()

// ¿Dos lecturas de `findRatingSourceStats` describen el mismo origen? Misma
// cantidad de partidos rateables y mismo instante de `maxUpdatedAt` (`null`
// igual a `null`; instancias distintas de `Date` con el mismo instante son
// iguales).
const sameSourceStats = (a, b) =>
    a?.ratedMatches === b?.ratedMatches &&
    timeOf(a?.maxUpdatedAt) === timeOf(b?.maxUpdatedAt)

module.exports = {
    describeChanges,
    diffAgainstStored,
    loadRatingsState,
    sameSourceStats,
}
