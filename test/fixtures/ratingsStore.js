"use strict"
// Fixtures de los tests de ratings persistidos (service/ratingsStore).
const mongoose = require("mongoose")
const { buildRatingsTimeline } = require("../../service/playerRatings/timeline")

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const LEO = { id: "l", name: "Leo" }
const ZETA = { id: "z", name: "Zeta" }
const BOCA = { id: 1, name: "Boca" }
const RIVER = { id: 2, name: "River" }

const objectId = (n) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"))

const match = (
    n,
    playerP1,
    scoreP1,
    playerP2,
    scoreP2,
    playedAt,
    extra = {}
) => ({
    _id: objectId(n),
    playerP1,
    teamP1: BOCA,
    scoreP1,
    playerP2,
    teamP2: RIVER,
    scoreP2,
    playedAt: new Date(playedAt),
    tournament: { id: "t1", name: "Liga APA" },
    type: "regular",
    played: true,
    valid: true,
    ...extra,
})

// Fechas repetidas (desempate por _id), un empate de liga, un empate de playoff
// definido por penales, partidos con y sin término de equipo, y dos partidos
// que el motor no rate (no jugado y sin goles).
const history = () => [
    match(1, NICO, 2, SANTI, 0, "2026-01-01T15:00:00Z", { withTeams: true }),
    match(2, LEO, 1, NICO, 1, "2026-01-02T15:00:00Z"),
    match(3, SANTI, 3, LEO, 1, "2026-01-02T15:00:00Z"),
    match(4, NICO, 0, LEO, 2, "2026-01-02T15:00:00Z", { withTeams: true }),
    match(5, SANTI, 1, NICO, 4, "2026-01-05T15:00:00Z", { type: "playoff" }),
    match(6, LEO, 2, SANTI, 2, "2026-01-06T15:00:00Z", {
        type: "playoff",
        withTeams: true,
    }),
    match(7, NICO, 1, ZETA, 0, "2026-01-07T15:00:00Z", { played: false }),
    match(8, ZETA, null, LEO, null, "2026-01-08T15:00:00Z"),
]

const teamStrength = (m) => (m.withTeams ? { t1: 82, t2: 76 } : null)

const buildTimeline = (matches = history()) =>
    buildRatingsTimeline(matches, { teamStrength })

// Stats del origen de `history()`: 7 partidos cumplen el filtro del motor (el
// #7 es `played: false`) pero solo 6 generan evento, así que `ratedMatches`
// queda mayor que la cantidad de eventos.
const SOURCE_STATS = {
    ratedMatches: 7,
    maxUpdatedAt: new Date("2026-01-09T12:00:00Z"),
}

module.exports = {
    LEO,
    NICO,
    SANTI,
    SOURCE_STATS,
    ZETA,
    buildTimeline,
    history,
    match,
    objectId,
    teamStrength,
}
