const { RATING_CONFIG } = require("../../config/ratings")
const { assessFreshness } = require("../ratingsStore/freshness")

// Ranking actual (`GET /api/ratings`) leído de los ratings persistidos. Devuelve
// `{ players }` con el MISMO estado por jugador que arma el motor para el ranking
// (id, name, rating, peak, matches, wins, draws, losses, lastPlayedAt en
// milisegundos o null, lastChange), listo para `rankPlayers` y `toRankingRow`,
// si lo guardado está fresco; o `{ stale: <razón> }` si no. Un dato viejo NUNCA
// lanza: lanzan solo las fallas de lectura de los DAOs y los documentos
// malformados (el que lo usa lo registra como error y calcula en vivo).
//
// Frescura: las mismas reglas que la predicción (`assessFreshness`). Las dos
// lecturas salen en paralelo. No hay eventos: el ranking sale entero de
// `player-ratings`.
const isFiniteNumber = (value) =>
    typeof value === "number" && Number.isFinite(value)
const isCount = (value) => Number.isInteger(value) && value >= 0

const fail = (message) => {
    throw new Error(`createRetrieveStoredRanking: ${message}`)
}

const toPlayerState = (doc) => {
    if (typeof doc.id !== "string" || doc.id === "") {
        fail("un jugador guardado no tiene id (string)")
    }
    if (typeof doc.name !== "string") {
        fail(`el jugador ${doc.id} no tiene name`)
    }
    for (const field of ["rating", "peak"]) {
        if (!isFiniteNumber(doc[field])) {
            fail(`el jugador ${doc.id} no tiene ${field} numérico`)
        }
    }
    for (const field of ["matches", "wins", "draws", "losses"]) {
        if (!isCount(doc[field])) {
            fail(`el jugador ${doc.id} no tiene ${field} entero >= 0`)
        }
    }
    const { lastPlayedAt, lastChange } = doc
    if (
        lastPlayedAt !== null &&
        lastPlayedAt !== undefined &&
        !(lastPlayedAt instanceof Date && !Number.isNaN(lastPlayedAt.getTime()))
    ) {
        fail(`el jugador ${doc.id} tiene un lastPlayedAt inválido`)
    }
    if (
        lastChange !== null &&
        lastChange !== undefined &&
        !isFiniteNumber(lastChange)
    ) {
        fail(`el jugador ${doc.id} tiene un lastChange inválido`)
    }

    return {
        id: doc.id,
        name: doc.name,
        rating: doc.rating,
        peak: doc.peak,
        matches: doc.matches,
        wins: doc.wins,
        draws: doc.draws,
        losses: doc.losses,
        lastPlayedAt:
            lastPlayedAt === null || lastPlayedAt === undefined
                ? null
                : lastPlayedAt.getTime(),
        lastChange: lastChange ?? null,
    }
}

const createRetrieveStoredRanking = ({
    findRatingSourceStats,
    findRankingPlayerRatings,
    getCurrentFingerprint,
    config = RATING_CONFIG,
} = {}) => {
    for (const [name, dependency] of Object.entries({
        findRatingSourceStats,
        findRankingPlayerRatings,
        getCurrentFingerprint,
    })) {
        if (typeof dependency !== "function") {
            throw new TypeError(`createRetrieveStoredRanking: falta ${name}`)
        }
    }

    return async () => {
        const [currentSourceStats, docs] = await Promise.all([
            findRatingSourceStats(),
            findRankingPlayerRatings(config.version),
        ])
        const currentFingerprint = await getCurrentFingerprint()
        const freshness = assessFreshness({
            players: docs,
            currentFingerprint,
            currentSourceStats,
            ratingVersion: config.version,
        })
        if (!freshness.fresh) return { stale: freshness.reason }

        const players = new Map()
        for (const doc of docs) {
            players.set(doc.id, toPlayerState(doc))
        }
        return { players }
    }
}

module.exports = { createRetrieveStoredRanking }
