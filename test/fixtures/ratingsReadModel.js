"use strict"
// Fixtures de los tests del read-model de ratings (service/ratingsReadModel,
// service/ratingsStore/freshness, dao/findPlayerRatings y
// dao/findRatingEventsByMatchIds).
const mongoose = require("mongoose")
const teamRatingsData = require("../../data/teamRatings.json")
const { buildRatingsTimeline } = require("../../service/playerRatings/timeline")
const {
    buildRatingDocuments,
} = require("../../service/ratingsStore/buildRatingDocuments")
const { match, objectId } = require("./ratingsStore")

const FINGERPRINT = "f".repeat(64)
const COMPUTED_AT = new Date("2026-03-01T00:00:00Z")
const SOURCE_STATS = {
    ratedMatches: 20,
    maxUpdatedAt: new Date("2026-02-20T12:00:00Z"),
}

const ANA = { id: "a", name: "Ana" }
const BETO = { id: "b", name: "Beto" }
const CARO = { id: "c", name: "Caro" }
// Juega pocos partidos: sirve para tener predicciones provisorias.
const DANI = { id: "d", name: "Dani" }
const NEWCOMER = { id: "newcomer", name: "Recién llegado" }

// Un torneo con edición conocida, dos equipos con overall en esa edición y un
// equipo / torneo sin dato, leídos de data/teamRatings.json para ejercitar el
// lookup REAL (no uno inyectado).
const realTeamIds = () => {
    const { editionByTournament, overallByTeamEdition } = teamRatingsData
    for (const [tournamentId, edition] of Object.entries(editionByTournament)) {
        const teams = Object.keys(overallByTeamEdition)
            .filter((key) => key.endsWith(`|${edition}`))
            .map((key) => key.slice(0, key.lastIndexOf("|")))
        if (teams.length >= 2) {
            return {
                tournamentId,
                edition,
                teamA: { id: teams[0], name: `Equipo ${teams[0]}` },
                teamB: { id: teams[1], name: `Equipo ${teams[1]}` },
                // Id de equipo sin overall en ninguna edición.
                teamWithoutOverall: { id: "9999999", name: "Sin overall" },
                // Torneo sin edición cargada.
                tournamentWithoutEdition: "ffffffffffffffffffffffff",
            }
        }
    }
    throw new Error("data/teamRatings.json no tiene una edición con 2 equipos")
}

// Historial sintético: 18 partidos entre Ana, Beto y Caro (cada uno supera los
// 10 partidos, así que las últimas predicciones dejan de ser provisorias), más
// dos de Dani (pocos partidos). Fechas distintas, ligas y playoffs, empates, y
// algunos partidos con equipos y torneo reales (con término de equipo).
const syntheticHistory = () => {
    const real = realTeamIds()
    const pairs = [
        [ANA, BETO],
        [BETO, CARO],
        [CARO, ANA],
    ]
    const scores = [
        [2, 0],
        [1, 1],
        [0, 3],
        [4, 2],
        [2, 2],
        [1, 0],
        [0, 1],
        [3, 1],
        [2, 2],
    ]
    const matches = []
    for (let n = 1; n <= 18; n += 1) {
        const [playerP1, playerP2] = pairs[(n - 1) % pairs.length]
        const [scoreP1, scoreP2] = scores[(n - 1) % scores.length]
        const day = String(n).padStart(2, "0")
        const extra = { type: n % 5 === 0 ? "playoff" : "regular" }
        if (n % 3 === 0) {
            extra.teamP1 = real.teamA
            extra.teamP2 = real.teamB
            extra.tournament = { id: real.tournamentId, name: "Torneo real" }
        }
        matches.push(
            match(
                n,
                playerP1,
                scoreP1,
                playerP2,
                scoreP2,
                `2026-01-${day}T15:00:00Z`,
                extra
            )
        )
    }
    matches.push(
        match(19, DANI, 1, ANA, 2, "2026-02-01T15:00:00Z"),
        match(20, BETO, 0, DANI, 0, "2026-02-02T15:00:00Z")
    )
    return matches
}

// Documentos tal como los persistiría recompute: motor real + builder real.
const storedDocsFrom = (
    matches,
    { sourceStats = SOURCE_STATS, fingerprint = FINGERPRINT } = {}
) =>
    buildRatingDocuments(buildRatingsTimeline(matches), {
        fingerprint,
        computedAt: COMPUTED_AT,
        sourceStats,
    })

const copyDate = (date) => (date instanceof Date ? new Date(date) : date)

// Simulan la proyección de `findPlayerRatings` y el `.lean()` (objetos planos).
const leanPlayers = (docs) =>
    docs.players.map((player) => ({
        ratingVersion: player.ratingVersion,
        id: player.id,
        rating: player.rating,
        matches: player.matches,
        fingerprint: player.fingerprint,
        ...(player.source !== undefined && {
            source: {
                ratedMatches: player.source.ratedMatches,
                maxUpdatedAt: copyDate(player.source.maxUpdatedAt),
            },
        }),
    }))

// Proyección de `findRatingEventsByMatchIds`; `matchId` vuelve como ObjectId.
const leanEvents = (docs) =>
    docs.events.map((event) => ({
        matchId: new mongoose.Types.ObjectId(String(event.matchId)),
        expectedP1: event.expectedP1,
        p1: { games: event.p1.games, teamOverall: event.p1.teamOverall },
        p2: { games: event.p2.games },
        fingerprint: event.fingerprint,
    }))

// Los tres DAOs de lectura en memoria. Leen `docs` / `sourceStats` en cada
// llamada (los tests pueden mutarlos) y registran cada llamada en `calls`.
const fakeReadDaos = ({
    docs,
    sourceStats = SOURCE_STATS,
    calls = [],
} = {}) => ({
    findRatingSourceStats: async () => {
        calls.push({ dao: "findRatingSourceStats", args: [] })
        return sourceStats
    },
    findPlayerRatings: async (ratingVersion) => {
        calls.push({ dao: "findPlayerRatings", args: [ratingVersion] })
        return leanPlayers(docs).filter(
            (player) => player.ratingVersion === ratingVersion
        )
    },
    findRatingEventsByMatchIds: async (ratingVersion, ids) => {
        calls.push({
            dao: "findRatingEventsByMatchIds",
            args: [ratingVersion, ids],
        })
        const wanted = new Set(ids.map(String))
        return leanEvents({
            events: docs.events.filter(
                (event) =>
                    event.ratingVersion === ratingVersion &&
                    wanted.has(String(event.matchId))
            ),
        })
    },
})

module.exports = {
    ANA,
    BETO,
    CARO,
    COMPUTED_AT,
    DANI,
    FINGERPRINT,
    NEWCOMER,
    SOURCE_STATS,
    fakeReadDaos,
    leanEvents,
    leanPlayers,
    objectId,
    realTeamIds,
    storedDocsFrom,
    syntheticHistory,
}
