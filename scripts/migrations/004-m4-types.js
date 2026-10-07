/*
 * M4: tipos consistentes (plan de normalización, ítem 5.6; decisión D5).
 *   - ids de equipo string /^\d+$/ -> number en partidos (teamP1/teamP2 y
 *     outcome.teamThatWon/teamThatLost) y torneos (teams[] entero y
 *     outcome.champion/finalist.team.id);
 *   - outcome.scoreFromTeamThatWon/Lost string numérico -> number.
 * Los valores no numéricos o con ceros a la izquierda no se tocan: quedan
 * listados en un check fallido. Filtros idempotentes por `$type: "string"`.
 */

const { describeUpdate, getPath } = require("./lib/memory")
const { COLLECTIONS } = require("./lib/snapshot")

const ID = "004-m4-types"
const MATCHES = COLLECTIONS.matches
const TOURNAMENTS = COLLECTIONS.tournaments

const MATCH_TEAM_ID_PATHS = [
    "teamP1.id",
    "teamP2.id",
    "outcome.teamThatWon.id",
    "outcome.teamThatLost.id",
]
const MATCH_SCORE_PATHS = [
    "outcome.scoreFromTeamThatWon",
    "outcome.scoreFromTeamThatLost",
]
const TOURNAMENT_TEAM_ID_PATHS = [
    "outcome.champion.team.id",
    "outcome.finalist.team.id",
]
const TEAMS_ARRAY_PATH = "teams"
const TEAMS_ARRAY_FILTER = "teams.team.id"

const NUMERIC = /^\d+$/

const idKey = (value) =>
    value === null || value === undefined ? null : String(value)

const check = (name, ok, detail = "") => ({ name, ok: Boolean(ok), detail })

// number si es un entero canónico ("10"), null si no se puede convertir.
const toCanonicalNumber = (value) =>
    typeof value === "string" &&
    NUMERIC.test(value) &&
    String(Number(value)) === value &&
    Number.isSafeInteger(Number(value))
        ? Number(value)
        : null

const plan = (snapshot) => {
    const ops = []
    const invalidIds = []
    const invalidScores = []
    const byField = {}
    const byTournament = new Map()
    const count = (collection, path) => {
        const key = `${collection}:${path}`
        byField[key] = (byField[key] || 0) + 1
    }

    const coercePaths = (document, collection, paths, invalid, $set, filter) =>
        paths.forEach((path) => {
            const value = getPath(document, path)
            if (typeof value !== "string") return
            const number = toCanonicalNumber(value)
            if (number === null) {
                invalid.push(`${collection}/${idKey(document._id)} ${path}`)
                return
            }
            $set[path] = number
            filter[path] = { $type: "string" }
            count(collection, path)
        })

    const pushOp = (document, collection, $set, filter, group) => {
        if (!Object.keys($set).length) return false
        const update = { $set }
        ops.push({
            collection,
            _id: document._id,
            filter: { _id: document._id, ...filter },
            update,
            group,
            rule: Object.keys($set).join(", "),
            ...describeUpdate(document, update),
        })
        return true
    }

    snapshot.matches.forEach((match) => {
        const $set = {}
        const filter = {}
        coercePaths(
            match,
            MATCHES,
            MATCH_TEAM_ID_PATHS,
            invalidIds,
            $set,
            filter
        )
        coercePaths(
            match,
            MATCHES,
            MATCH_SCORE_PATHS,
            invalidScores,
            $set,
            filter
        )
        const hasIds = MATCH_TEAM_ID_PATHS.some((path) => path in $set)
        const hasScores = MATCH_SCORE_PATHS.some((path) => path in $set)
        const group =
            hasIds && hasScores
                ? "match-ids+scores"
                : hasIds
                ? "match-ids"
                : "match-scores"
        if (pushOp(match, MATCHES, $set, filter, group)) {
            const key = idKey(match.tournament?.id) ?? "(sin torneo)"
            byTournament.set(key, (byTournament.get(key) || 0) + 1)
        }
    })

    snapshot.tournaments.forEach((tournament) => {
        const $set = {}
        const filter = {}
        coercePaths(
            tournament,
            TOURNAMENTS,
            TOURNAMENT_TEAM_ID_PATHS,
            invalidIds,
            $set,
            filter
        )

        if (Array.isArray(tournament.teams)) {
            let changed = false
            const teams = tournament.teams.map((entry, index) => {
                const value = entry?.team?.id
                if (typeof value !== "string") return entry
                const number = toCanonicalNumber(value)
                if (number === null) {
                    invalidIds.push(
                        `${TOURNAMENTS}/${idKey(
                            tournament._id
                        )} teams.${index}.team.id`
                    )
                    return entry
                }
                changed = true
                return { ...entry, team: { ...entry.team, id: number } }
            })
            if (changed) {
                // Array entero: los paths no atraviesan arrays.
                $set[TEAMS_ARRAY_PATH] = teams
                filter[TEAMS_ARRAY_FILTER] = { $type: "string" }
                count(TOURNAMENTS, TEAMS_ARRAY_PATH)
            }
        }

        pushOp(tournament, TOURNAMENTS, $set, filter, "tournament-team-ids")
    })

    const names = new Map(
        snapshot.tournaments.map((tournament) => [
            idKey(tournament._id),
            tournament.name,
        ])
    )
    const listDetail = (items) =>
        `${items.slice(0, 20).join("; ")}${
            items.length > 20 ? ` (+${items.length - 20})` : ""
        }`

    return {
        ops,
        report: {
            summary: {
                scanned: {
                    matches: snapshot.matches.length,
                    tournaments: snapshot.tournaments.length,
                },
                toChange: ops.length,
                matchesWithStringTeamIds: ops.filter(
                    (op) =>
                        op.collection === MATCHES && op.group.includes("ids")
                ).length,
                matchesWithStringScores: ops.filter(
                    (op) =>
                        op.collection === MATCHES && op.group.includes("scores")
                ).length,
                tournamentsWithStringTeams: ops.filter(
                    (op) =>
                        op.collection === TOURNAMENTS &&
                        TEAMS_ARRAY_PATH in op.update.$set
                ).length,
                byField,
                invalidIds: invalidIds.length,
                invalidScores: invalidScores.length,
            },
            byTournament: [...byTournament.entries()].map(
                ([tournamentId, toChange]) => ({
                    tournamentId,
                    name: names.get(tournamentId) || "",
                    toChange,
                    byRule: {},
                })
            ),
            checks: [
                check(
                    "0 ids de equipo no numéricos o con ceros a la izquierda",
                    !invalidIds.length,
                    listDetail(invalidIds)
                ),
                check(
                    "0 scores no numéricos",
                    !invalidScores.length,
                    listDetail(invalidScores)
                ),
            ],
            needsConfirmation: [],
        },
    }
}

const createMigration = () => ({
    id: ID,
    title: "M4: ids de equipo y scores como number",
    dependsOn: [],
    collections: [MATCHES, TOURNAMENTS],
    plan: (snapshot, context) => plan(snapshot, context),
})

module.exports = { ...createMigration(), createMigration, toCanonicalNumber }
