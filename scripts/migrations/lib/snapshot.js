/*
 * Snapshot en memoria de las dos colecciones que migran. Proyecciones
 * explícitas: los nombres de jugadores quedan sólo en memoria (M7 recalcula
 * outcomes) y nunca llegan al reporte. Nunca se lee `users`.
 */

const COLLECTIONS = Object.freeze({
    matches: "face-to-face",
    tournaments: "tournaments",
})

// Registro de migraciones aplicadas (sólo lo escribe lib/apply.js).
const REGISTRY_COLLECTION = "migrations"

const toProjection = (fields) =>
    Object.freeze(Object.fromEntries(fields.map((field) => [field, 1])))

const MATCH_PROJECTION = toProjection([
    "_id",
    "tournament",
    "type",
    "group",
    "playoff_id",
    "leg",
    "seriesRevision",
    "played",
    "valid",
    "playerP1.id",
    "playerP2.id",
    "playerP1.name",
    "playerP2.name",
    "teamP1",
    "teamP2",
    "seedP1",
    "seedP2",
    "scoreP1",
    "scoreP2",
    "outcome",
    "playedAt",
    "playedAtPrecision",
    "createdAt",
    "updatedAt",
])

const TOURNAMENT_PROJECTION = toProjection([
    "_id",
    "name",
    "format",
    "playoffMode",
    "legacy",
    "ongoing",
    "valid",
    "createdAt",
    "updatedAt",
    "outcome",
    "teams",
    "startedAt",
    "startedAtPrecision",
    "closedAt",
    "closedAtPrecision",
])

const loadSnapshot = async (readOnlyDb) => {
    const [matches, tournaments] = await Promise.all([
        readOnlyDb
            .collection(COLLECTIONS.matches)
            .find({}, { projection: MATCH_PROJECTION, sort: { _id: 1 } })
            .toArray(),
        readOnlyDb
            .collection(COLLECTIONS.tournaments)
            .find({}, { projection: TOURNAMENT_PROJECTION, sort: { _id: 1 } })
            .toArray(),
    ])

    return { matches, tournaments }
}

const snapshotCounts = (snapshot) => ({
    matches: snapshot.matches.length,
    tournaments: snapshot.tournaments.length,
})

module.exports = {
    COLLECTIONS,
    MATCH_PROJECTION,
    REGISTRY_COLLECTION,
    TOURNAMENT_PROJECTION,
    loadSnapshot,
    snapshotCounts,
}
