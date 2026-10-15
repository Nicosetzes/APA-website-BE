// Convierte el timeline del motor en los documentos que se persisten
// (`rating-events` y `player-ratings`). Función pura: no lee ni escribe la base
// y no muta el timeline.
//
// - `events`: uno por partido rateado, en el orden cronológico del motor
//   (`seq` 1-based). `after` se deriva igual que `snapshotBefore`:
//   p1.after = p1.before + delta, p2.after = p2.before - delta.
// - `players`: estado final de cada jugador con al menos un evento.
//
// Nunca se emite `undefined` (siempre `null`): Mongoose lo descarta y el diff
// vería diferencias falsas.
const toDate = (ms) => (ms === null || ms === undefined ? null : new Date(ms))

const buildSide = (side, after) => ({
    id: side.id,
    name: side.name,
    before: side.before,
    after,
    games: side.games,
    team: side.team ?? null,
    teamOverall: side.teamOverall ?? null,
})

// Valida las stats del origen y devuelve el `source` a persistir (con una copia
// de la fecha, para no compartir la instancia con quien llamó).
const buildSource = (sourceStats) => {
    const { ratedMatches, maxUpdatedAt } = sourceStats
    if (!Number.isInteger(ratedMatches) || ratedMatches < 0) {
        throw new Error(
            "buildRatingDocuments: sourceStats.ratedMatches tiene que ser un entero >= 0"
        )
    }
    const validDate =
        maxUpdatedAt instanceof Date && !Number.isNaN(maxUpdatedAt.getTime())
    if (maxUpdatedAt !== null && !validDate) {
        throw new Error(
            "buildRatingDocuments: sourceStats.maxUpdatedAt tiene que ser una Date válida o null"
        )
    }
    return {
        ratedMatches,
        maxUpdatedAt: maxUpdatedAt === null ? null : new Date(maxUpdatedAt),
    }
}

// `sourceStats` (opcional): `{ ratedMatches, maxUpdatedAt }` del origen. Si no es
// `null` se agrega `source` a cada jugador (no a los eventos); si es `null` la
// clave se OMITE, así el documento queda igual al de la etapa 1.
const buildRatingDocuments = (
    timeline,
    { fingerprint, computedAt, sourceStats = null } = {}
) => {
    const ratingVersion = timeline?.config?.version
    if (typeof ratingVersion !== "string" || !ratingVersion) {
        throw new Error(
            "buildRatingDocuments: el timeline no tiene config.version"
        )
    }
    if (typeof fingerprint !== "string" || !fingerprint) {
        throw new Error("buildRatingDocuments: falta el fingerprint (string)")
    }
    if (!(computedAt instanceof Date) || Number.isNaN(computedAt.getTime())) {
        throw new Error(
            "buildRatingDocuments: computedAt tiene que ser una Date válida"
        )
    }

    if (
        sourceStats !== null &&
        (typeof sourceStats !== "object" || !sourceStats)
    ) {
        throw new Error(
            "buildRatingDocuments: sourceStats tiene que ser un objeto o null"
        )
    }
    // Se valida antes de armar nada; cada jugador recibe su propia copia.
    const hasSource = sourceStats !== null
    if (hasSource) buildSource(sourceStats)

    const eventCounts = new Map()
    const countEvent = (id) =>
        eventCounts.set(id, (eventCounts.get(id) ?? 0) + 1)

    const events = timeline.events.map((event, index) => {
        if (event.matchId === null || event.matchId === undefined) {
            throw new Error(
                "buildRatingDocuments: evento de rating sin matchId, no se puede indexar"
            )
        }
        countEvent(event.p1.id)
        countEvent(event.p2.id)
        return {
            ratingVersion,
            seq: index + 1,
            matchId: String(event.matchId),
            time: toDate(event.time),
            tournament: event.tournament ?? null,
            type: event.type ?? null,
            scoreP1: event.scoreP1,
            scoreP2: event.scoreP2,
            expectedP1: event.expectedP1,
            resultP1: event.resultP1,
            delta: event.delta,
            teamAdjustment: event.teamAdjustment,
            p1: buildSide(event.p1, event.p1.before + event.delta),
            p2: buildSide(event.p2, event.p2.before - event.delta),
            fingerprint,
            computedAt,
        }
    })

    const players = [...timeline.players.values()]
        .filter((player) => eventCounts.has(player.id))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((player) => ({
            ratingVersion,
            id: player.id,
            name: player.name,
            rating: player.rating,
            peak: player.peak,
            matches: player.matches,
            wins: player.wins,
            draws: player.draws,
            losses: player.losses,
            lastPlayedAt: toDate(player.lastPlayedAt),
            lastChange: player.lastChange ?? null,
            eventCount: eventCounts.get(player.id),
            ...(hasSource && { source: buildSource(sourceStats) }),
            fingerprint,
            computedAt,
        }))

    return { events, players }
}

module.exports = { buildRatingDocuments }
