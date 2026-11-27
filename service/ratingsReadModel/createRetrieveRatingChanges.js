const { RATING_CONFIG } = require("../../config/ratings")
const { round } = require("../playerRatings/presentation")
const { assessFreshness } = require("../ratingsStore/freshness")

// Variación de rating por partido, leída de los ratings persistidos (los mismos
// que usa la predicción). Devuelve `{ changes }` con un Map matchId ->
// { p1, p2, ratingVersion } si lo guardado está fresco, o `{ stale: <razón> }` si
// no. Un dato viejo NUNCA lanza; lanzan solo las fallas de lectura de los DAOs.
//
// Reglas de frescura idénticas a las de la predicción (`assessFreshness` más la
// huella de cada evento). No hay cálculo en vivo de reemplazo: si lo guardado no
// está al día, la columna queda vacía hasta la próxima sincronización.
//
// Un partido pedido que no tiene evento (por ejemplo uno recién cargado que la
// sincronización todavía no guardó) simplemente no aparece en el Map: los demás
// conservan su valor.
//
// Las tres lecturas salen en paralelo (un solo viaje a la base); si no hay ids
// pedidos no se lee nada.
const roundPoints = (value) => {
    const rounded = Math.round(value * 100) / 100
    // Sin "-0".
    return rounded === 0 ? 0 : rounded
}

const emptyPerformance = () => ({
    matches: 0,
    actualPercentage: null,
    expectedPercentage: null,
    differencePercentagePoints: null,
})

const presentPerformance = ({ matches, actual, expected }) =>
    matches === 0
        ? emptyPerformance()
        : {
              matches,
              actualPercentage: round((actual / matches) * 100),
              expectedPercentage: round((expected / matches) * 100),
              differencePercentagePoints: round(
                  ((actual - expected) / matches) * 100
              ),
          }

// Los eventos están en perspectiva P1. Solo suma eventos válidos del par y
// orienta explícitamente expected/result hacia los dos jugadores solicitados.
const buildHeadToHeadRatingComparison = (events, playerA, playerB) => {
    const totals = {
        playerA: { matches: 0, actual: 0, expected: 0 },
        playerB: { matches: 0, actual: 0, expected: 0 },
    }

    for (const event of events) {
        if (
            !Number.isFinite(event.expectedP1) ||
            !Number.isFinite(event.resultP1) ||
            event.expectedP1 < 0 ||
            event.expectedP1 > 1 ||
            event.resultP1 < 0 ||
            event.resultP1 > 1
        ) {
            continue
        }

        const p1 = String(event.p1?.id)
        const p2 = String(event.p2?.id)
        const aIsP1 = p1 === playerA && p2 === playerB
        const aIsP2 = p1 === playerB && p2 === playerA
        if (!aIsP1 && !aIsP2) continue

        const actualA = aIsP1 ? event.resultP1 : 1 - event.resultP1
        const expectedA = aIsP1 ? event.expectedP1 : 1 - event.expectedP1
        totals.playerA.matches += 1
        totals.playerA.actual += actualA
        totals.playerA.expected += expectedA
        totals.playerB.matches += 1
        totals.playerB.actual += 1 - actualA
        totals.playerB.expected += 1 - expectedA
    }

    return {
        playerA: presentPerformance(totals.playerA),
        playerB: presentPerformance(totals.playerB),
    }
}

const createRetrieveRatingChanges = ({
    findRatingSourceStats,
    findPlayerRatings,
    findRatingChangesByMatchIds,
    getCurrentFingerprint,
    config = RATING_CONFIG,
} = {}) => {
    for (const [name, dependency] of Object.entries({
        findRatingSourceStats,
        findPlayerRatings,
        findRatingChangesByMatchIds,
        getCurrentFingerprint,
    })) {
        if (typeof dependency !== "function") {
            throw new TypeError(`createRetrieveRatingChanges: falta ${name}`)
        }
    }

    return async ({ matchIds = [], playerA, playerB } = {}) => {
        const requiredIds = [...new Set(matchIds.map(String))]
        const hasPair = playerA !== undefined && playerB !== undefined
        const normalizedPlayerA = hasPair ? String(playerA) : null
        const normalizedPlayerB = hasPair ? String(playerB) : null
        if (requiredIds.length === 0) {
            return {
                changes: new Map(),
                ...(hasPair && {
                    comparison: buildHeadToHeadRatingComparison(
                        [],
                        normalizedPlayerA,
                        normalizedPlayerB
                    ),
                }),
            }
        }

        const [currentSourceStats, players, events] = await Promise.all([
            findRatingSourceStats(),
            findPlayerRatings(config.version),
            findRatingChangesByMatchIds(config.version, requiredIds),
        ])
        const currentFingerprint = await getCurrentFingerprint()
        const freshness = assessFreshness({
            players,
            currentFingerprint,
            currentSourceStats,
            ratingVersion: config.version,
        })
        if (!freshness.fresh) return { stale: freshness.reason }
        if (events.some((event) => event.fingerprint !== currentFingerprint)) {
            return { stale: "fingerprint_mismatch" }
        }

        const changes = new Map()
        for (const event of events) {
            if (
                typeof event.delta !== "number" ||
                !Number.isFinite(event.delta)
            ) {
                continue
            }
            const p1 = roundPoints(event.delta)
            changes.set(String(event.matchId), {
                p1,
                p2: p1 === 0 ? 0 : -p1,
                ratingVersion: config.version,
            })
        }
        return {
            changes,
            ...(hasPair && {
                comparison: buildHeadToHeadRatingComparison(
                    events,
                    normalizedPlayerA,
                    normalizedPlayerB
                ),
            }),
        }
    }
}

module.exports = {
    buildHeadToHeadRatingComparison,
    createRetrieveRatingChanges,
    roundPoints,
}
