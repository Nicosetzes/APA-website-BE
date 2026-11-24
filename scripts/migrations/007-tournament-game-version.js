/*
 * 007: edición del juego de cada torneo en la base (`gameVersion`).
 *
 * Hasta acá la edición vivía en data/tournament-editions.csv (un archivo del
 * repo). Desde ahora es un campo inmutable del torneo, que se elige al crearlo
 * y se copia a la referencia `tournament` de cada partido (el motor de
 * ratings la lee de ahí). Esta migración completa los torneos ya existentes con
 * los valores de ese CSV (copiados abajo, el CSV se borró del repo) y la
 * misma edición en `tournament.gameVersion` de todos sus partidos.
 *
 * - Idempotente: solo escribe donde el campo falta (filtro `$exists: false`).
 * - Bloquea si un torneo o partido ya tiene una edición distinta de la de acá.
 * - Torneos o partidos sin edición conocida no se tocan: quedan como nota
 *   (sus partidos se calculan como en el rating 1.0, igual que antes).
 */
const { describeUpdate } = require("./lib/memory")
const { COLLECTIONS } = require("./lib/snapshot")
const { GAME_VERSIONS } = require("../../service/playerRatings/teamStrength")
const ID = "007-tournament-game-version"
const MATCHES = COLLECTIONS.matches
const TOURNAMENTS = COLLECTIONS.tournaments
// Copia de data/tournament-editions.csv (columna `edition`) al 2026-11-24.
const GAME_VERSION_BY_TOURNAMENT = Object.freeze({
    "64697ac9d542ff4ada3038d3": "FIFA 19", // Chempions 2019/20
    "6afc6d92ef16789aa5c2369b": "FIFA 21", // Torneo Argentino 2021
    "625e0f191b3f1ce6b5ee4756": "FIFA 22", // Torneo Argentino 2021/22
    "625f32c9cfe012fb71aae3af": "FIFA 22", // Superliga Europea 2022
    "6457ae8d96efc21b03ba4cfe": "FIFA 22", // Superliga Inglesa 2022
    "6372f83c88e2408e9cadcc73": "FIFA 23", // Copa del Mundo 2022
    "6377fb8eb217aa7d3bf61eef": "FIFA 23", // Superliga ítalo-española 2022/23
    "646ff40e2524b3187034f790": "FIFA 23", // Superliga Argentina 2023
    "65296f319f7070f68fa8ec70": "FIFA 23", // Superliga Internacional 2023/24 (I)
    "6532e14f72b09831c4a5edf6": "FIFA 23", // Superliga Internacional 2023/24 (II)
    "659dcf45dd45bf53f0748a0d": "FIFA 23", // Superliga Inglesa 2024
    "664d43458f37f00eba8ea380": "FC 24", // Chempions 2024
    "6737f0e81d249d13f55ff48c": "FC 25", // Mundial de Ferraris 2024/25
    "67bb58104e0e363cd8eecbf1": "FC 25", // Superliga Internacional 2025
    "692d1bf2917eda907823f8d8": "FC 26", // Copa Argentina 2025/26
    "695b007a9009908018bdc28f": "FC 26", // Liga Inglesa 2026
    "6a36172bac0f63a7f4481b84": "FC 26", // Copa del Mundo 2026
    "6a7e52af1780519ff48380c1": "FC 26", // Supercopa APA 2026
    "6ac43e5daf82ded99b21b660": "FC 26", // Copa Afinidades 2026
})
const MATCH_PATH = "tournament.gameVersion"
const idKey = (value) =>
    value === null || value === undefined ? null : String(value)
const check = (name, ok, detail = "") => ({ name, ok: Boolean(ok), detail })
const listDetail = (items) =>
    `${items.slice(0, 20).join("; ")}${
        items.length > 20 ? ` (+${items.length - 20})` : ""
    }`
const plan = (snapshot, _context, mapping = GAME_VERSION_BY_TOURNAMENT) => {
    const ops = []
    const conflicts = []
    const tournamentsById = new Map(
        snapshot.tournaments.map((tournament) => [
            idKey(tournament._id),
            tournament,
        ])
    )
    // Edición final de cada torneo: la que ya tiene o la de la tabla.
    const versionById = new Map()
    const byTournament = new Map()
    const bump = (tournamentId) => {
        const entry = byTournament.get(tournamentId) ?? {
            tournamentId,
            name: tournamentsById.get(tournamentId)?.name || "",
            toChange: 0,
            byRule: { tournament: 0, matches: 0 },
        }
        entry.toChange += 1
        return entry
    }
    snapshot.tournaments.forEach((tournament) => {
        const id = idKey(tournament._id)
        const current = tournament.gameVersion
        const expected = mapping[id]
        if (current !== undefined && current !== null) {
            if (expected && current !== expected) {
                conflicts.push(
                    `${TOURNAMENTS}/${id} tiene "${current}" y se esperaba "${expected}"`
                )
            }
            versionById.set(id, current)
            return
        }
        if (!expected) return
        versionById.set(id, expected)
        const update = { $set: { gameVersion: expected } }
        ops.push({
            collection: TOURNAMENTS,
            _id: tournament._id,
            filter: { _id: tournament._id, gameVersion: { $exists: false } },
            update,
            group: "tournament-game-version",
            rule: "gameVersion",
            ...describeUpdate(tournament, update),
        })
        bump(id).byRule.tournament += 1
    })
    const matchesWithoutVersion = new Map()
    snapshot.matches.forEach((match) => {
        const tournamentId = idKey(match.tournament?.id)
        if (tournamentId === null) return
        const version = versionById.get(tournamentId)
        const current = match.tournament?.gameVersion
        if (current !== undefined && current !== null) {
            if (version && current !== version) {
                conflicts.push(
                    `${MATCHES}/${idKey(
                        match._id
                    )} tiene "${current}" y su torneo "${version}"`
                )
            }
            return
        }
        if (!version) {
            matchesWithoutVersion.set(
                tournamentId,
                (matchesWithoutVersion.get(tournamentId) || 0) + 1
            )
            return
        }
        const update = { $set: { [MATCH_PATH]: version } }
        ops.push({
            collection: MATCHES,
            _id: match._id,
            filter: { _id: match._id, [MATCH_PATH]: { $exists: false } },
            update,
            group: "match-game-version",
            rule: MATCH_PATH,
            ...describeUpdate(match, update),
        })
        bump(tournamentId).byRule.matches += 1
    })
    const missingTournaments = Object.keys(mapping).filter(
        (id) => !tournamentsById.has(id)
    )
    const tournamentsWithoutVersion = snapshot.tournaments
        .map((tournament) => idKey(tournament._id))
        .filter((id) => !versionById.has(id))
    const unknownVersions = [...new Set(Object.values(mapping))].filter(
        (version) => !GAME_VERSIONS.includes(version)
    )
    const notes = []
    if (missingTournaments.length) {
        notes.push({
            kind: "torneos de la tabla que no están en la base",
            ids: missingTournaments,
            detail: listDetail(missingTournaments),
        })
    }
    if (tournamentsWithoutVersion.length) {
        notes.push({
            kind: "torneos sin edición conocida (no se tocan)",
            ids: tournamentsWithoutVersion,
            detail: listDetail(
                tournamentsWithoutVersion.map(
                    (id) =>
                        `${
                            tournamentsById.get(id)?.name || "(sin nombre)"
                        } [${id}] ${
                            matchesWithoutVersion.get(id) || 0
                        } partidos`
                )
            ),
        })
    }
    const countGroup = (collection) =>
        ops.filter((op) => op.collection === collection).length
    return {
        ops,
        report: {
            summary: {
                scanned: {
                    matches: snapshot.matches.length,
                    tournaments: snapshot.tournaments.length,
                },
                toChange: ops.length,
                tournamentsToChange: countGroup(TOURNAMENTS),
                matchesToChange: countGroup(MATCHES),
                conflicts: conflicts.length,
            },
            byTournament: [...byTournament.values()],
            checks: [
                check(
                    "0 torneos o partidos con otra edición ya cargada",
                    !conflicts.length,
                    listDetail(conflicts)
                ),
                check(
                    "todas las ediciones de la tabla tienen overall cargado",
                    !unknownVersions.length,
                    unknownVersions.join(", ")
                ),
            ],
            needsConfirmation: [],
            notes,
        },
    }
}
const createMigration = ({ mapping = GAME_VERSION_BY_TOURNAMENT } = {}) => ({
    id: ID,
    title: "Edición del juego (gameVersion) en torneos y partidos",
    dependsOn: [],
    collections: [MATCHES, TOURNAMENTS],
    plan: (snapshot, context) => plan(snapshot, context, mapping),
})
module.exports = {
    ...createMigration(),
    GAME_VERSION_BY_TOURNAMENT,
    createMigration,
}
