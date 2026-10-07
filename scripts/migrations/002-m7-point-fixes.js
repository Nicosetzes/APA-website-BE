/*
 * M7: correcciones puntuales (plan de normalización, ítem 5.4).
 *   a. outcome con ganador/perdedor desactualizado -> recalculado desde los
 *      lados guardados (recomputeOutcomeParticipants), SÓLO en los partidos
 *      4 partidos aprobados de expectedOutcomeFixes y escribiendo sólo los
 *      campos de ganador/perdedor cuyo id está desactualizado. Los
 *      seedFromTeamThatWon/Lost faltantes (playoffs 2022) quedan como nota
 *      diferida, sin op; cualquier otro ganador/perdedor desactualizado
 *      fuera de la lista bloquea;
 *   b. Chempions 2024 -> ongoing: false (valid queda igual);
 *   c. tournament { id: null, name: null } -> tournament: null;
 *   d. partidos sin tournament.id con el nombre exacto de un torneo ->
 *      vinculados a ese torneo (id como string). Aprobado por el usuario
 *      para los dos nombres de linkByName (queda como nota, no a confirmar).
 * Una sola op por documento; el filtro exige los valores previos de cada
 * campo tocado, así que correrla de nuevo da 0 cambios.
 */

const { recomputeOutcomeParticipants } = require("../../utils/matchOutcome")
const { canonicalKey } = require("./lib/ejson")
const { describeUpdate, getPath } = require("./lib/memory")
const { COLLECTIONS } = require("./lib/snapshot")

const ID = "002-m7-point-fixes"
const MATCHES = COLLECTIONS.matches
const TOURNAMENTS = COLLECTIONS.tournaments

const DEFAULTS = Object.freeze({
    // _id del partido -> { campo desactualizado: id esperado al recalcular }.
    // Se escribe SÓLO ese campo (ni seeds ni el resto del outcome); un string
    // equivale a { teamThatWon: <id> }. Los dos últimos (valid:false) son
    // probablemente ediciones manuales en la base que no actualizaron el
    // perdedor del outcome; el ganador ya está bien.
    expectedOutcomeFixes: Object.freeze({
        "63405ea14060c65632366faa": Object.freeze({ teamThatWon: "49" }),
        "692d1bf2917eda907823f8e7": Object.freeze({ teamThatWon: "9568" }),
        "63a621a6b36157000dea8c1a": Object.freeze({
            playerThatLost: "6268a00eab8b56992d55405c",
        }),
        "6459a201c07b38450bfb0c0f": Object.freeze({ teamThatLost: "62" }),
    }),
    closeTournamentIds: Object.freeze(["664d43458f37f00eba8ea380"]),
    linkByName: Object.freeze([
        "Superliga Internacional 2023/24 (I)",
        "Superliga Internacional 2023/24 (II)",
    ]),
})

const PARTICIPANT_FIELDS = [
    "playerThatWon",
    "teamThatWon",
    "playerThatLost",
    "teamThatLost",
]
const SEED_FIELDS = ["seedFromTeamThatWon", "seedFromTeamThatLost"]
const OUTCOME_PATHS = [...PARTICIPANT_FIELDS, ...SEED_FIELDS]

const idKey = (value) =>
    value === null || value === undefined ? null : String(value)

const check = (name, ok, detail = "") => ({ name, ok: Boolean(ok), detail })

const guardFor = (document, paths) =>
    Object.fromEntries(
        paths.map((path) => {
            const value = getPath(document, path)
            return [path, value === undefined ? { $exists: false } : value]
        })
    )

const isNullReference = (tournament) =>
    tournament !== null &&
    typeof tournament === "object" &&
    Object.keys(tournament).length === 2 &&
    tournament.id === null &&
    tournament.name === null

const withoutTournamentId = (match) =>
    match.tournament !== null &&
    typeof match.tournament === "object" &&
    match.tournament.id === undefined

const normalizeExpected = (expectedOutcomeFixes) =>
    Object.fromEntries(
        Object.entries(expectedOutcomeFixes).map(([id, value]) => [
            id,
            typeof value === "object" && value !== null
                ? { ...value }
                : { teamThatWon: value },
        ])
    )

const plan = (snapshot, context = {}, options = {}) => {
    const config = { ...DEFAULTS, ...options }
    const expected = normalizeExpected(config.expectedOutcomeFixes)
    const ops = []
    const outcomeFixes = []
    const seedGaps = []
    const unexpectedParticipants = []
    const unexpectedEvidence = []
    const nullReferences = []
    const linked = {}
    const linkProblems = []

    const tournamentsByName = new Map()
    snapshot.tournaments.forEach((tournament) => {
        const list = tournamentsByName.get(tournament.name) || []
        list.push(tournament)
        tournamentsByName.set(tournament.name, list)
    })
    const linkTargets = new Map()
    config.linkByName.forEach((name) => {
        const candidates = tournamentsByName.get(name) || []
        linked[name] = { tournamentId: null, matches: 0 }
        if (candidates.length !== 1) {
            linkProblems.push(`${name}: ${candidates.length} torneos`)
            return
        }
        linkTargets.set(name, candidates[0])
        linked[name].tournamentId = idKey(candidates[0]._id)
    })

    snapshot.matches.forEach((match) => {
        const $set = {}
        const groups = []

        const { outcome, changed } = recomputeOutcomeParticipants(match)
        if (changed) {
            const id = idKey(match._id)
            const diff = {}
            OUTCOME_PATHS.forEach((field) => {
                const path = `outcome.${field}`
                if (!(field in outcome)) return
                if (
                    canonicalKey(getPath(match, path)) !==
                    canonicalKey(outcome[field])
                ) {
                    if (outcome[field] === undefined) return
                    diff[path] = outcome[field]
                }
            })
            // Ganador/perdedor por id (como recomputeOutcomeParticipants).
            const changedFields = PARTICIPANT_FIELDS.filter(
                (field) =>
                    String(match.outcome?.[field]?.id ?? "") !==
                    String(outcome[field]?.id ?? "")
            )
            const seedPaths = Object.keys(diff).filter((path) =>
                SEED_FIELDS.some((field) => path === `outcome.${field}`)
            )
            const approved = Object.prototype.hasOwnProperty.call(expected, id)
            if (seedPaths.length && (approved || !changedFields.length)) {
                // Seeds faltantes/distintos: diferido, nunca se escriben.
                seedGaps.push({
                    _id: id,
                    tournamentId: idKey(match.tournament?.id),
                    type: match.type,
                    playoff_id: match.playoff_id,
                    fields: seedPaths,
                })
            }
            if (!changedFields.length) {
                // Ganador/perdedor bien: nada que escribir.
            } else if (approved) {
                // Sólo los campos con el id desactualizado.
                changedFields.forEach((field) => {
                    $set[`outcome.${field}`] = outcome[field]
                })
                groups.push("outcome")
                outcomeFixes.push({
                    _id: id,
                    changedFields,
                    recomputedIds: Object.fromEntries(
                        changedFields.map((field) => [
                            field,
                            outcome[field]?.id ?? null,
                        ])
                    ),
                    storedIds: Object.fromEntries(
                        changedFields.map((field) => [
                            field,
                            match.outcome?.[field]?.id ?? null,
                        ])
                    ),
                    teamThatWonId: outcome.teamThatWon?.id,
                    teamP1Id: match.teamP1?.id,
                    teamP2Id: match.teamP2?.id,
                })
            } else {
                unexpectedParticipants.push(id)
                // Sólo ids (nunca nombres) para diagnosticar.
                unexpectedEvidence.push({
                    _id: id,
                    tournamentId: idKey(match.tournament?.id),
                    type: match.type,
                    playoff_id: match.playoff_id,
                    valid: match.valid,
                    scoreP1: match.scoreP1,
                    scoreP2: match.scoreP2,
                    penalties: match.outcome?.penalties,
                    sides: {
                        playerP1Id: match.playerP1?.id,
                        teamP1Id: match.teamP1?.id,
                        playerP2Id: match.playerP2?.id,
                        teamP2Id: match.teamP2?.id,
                    },
                    changed: Object.fromEntries(
                        PARTICIPANT_FIELDS.filter(
                            (field) =>
                                String(match.outcome?.[field]?.id ?? "") !==
                                String(outcome[field]?.id ?? "")
                        ).map((field) => [
                            field,
                            {
                                storedId: match.outcome?.[field]?.id ?? null,
                                recomputedId: outcome[field]?.id ?? null,
                            },
                        ])
                    ),
                })
            }
        }

        if (isNullReference(match.tournament)) {
            $set.tournament = null
            groups.push("null-tournament")
            nullReferences.push(idKey(match._id))
        } else if (withoutTournamentId(match)) {
            const target = linkTargets.get(match.tournament.name)
            if (target) {
                $set.tournament = {
                    id: idKey(target._id),
                    name: match.tournament.name,
                }
                groups.push("link-by-name")
                linked[match.tournament.name].matches += 1
            }
        }

        if (!groups.length) return
        const update = { $set }
        ops.push({
            collection: MATCHES,
            _id: match._id,
            filter: { _id: match._id, ...guardFor(match, Object.keys($set)) },
            update,
            group: groups.join("+"),
            rule: groups.join("+"),
            ...describeUpdate(match, update),
        })
    })

    const closeIds = new Set(config.closeTournamentIds)
    const closed = []
    snapshot.tournaments.forEach((tournament) => {
        if (!closeIds.has(idKey(tournament._id))) return
        if (tournament.ongoing !== true) return
        const update = { $set: { ongoing: false } }
        closed.push(idKey(tournament._id))
        ops.push({
            collection: TOURNAMENTS,
            _id: tournament._id,
            filter: { _id: tournament._id, ongoing: true },
            update,
            group: "close-tournament",
            rule: "ongoing: false (valid intacto)",
            ...describeUpdate(tournament, update),
        })
    })

    const expectedIds = Object.keys(expected).sort()
    const actualIds = outcomeFixes.map((fix) => fix._id).sort()
    // Cada aprobado cambia exactamente los campos esperados, a los ids
    // esperados (p. ej. sólo el perdedor: el ganador queda igual).
    const wrongValue = outcomeFixes
        .filter((fix) => {
            const fields = expected[fix._id]
            if (!fields) return false
            const expectedFields = Object.keys(fields).sort()
            return (
                [...fix.changedFields].sort().join(",") !==
                    expectedFields.join(",") ||
                expectedFields.some(
                    (field) =>
                        String(fix.recomputedIds[field]) !==
                        String(fields[field])
                )
            )
        })
        .map(
            (fix) =>
                `${fix._id} -> ${Object.entries(fix.recomputedIds)
                    .map(([field, value]) => `${field}=${value}`)
                    .join(", ")}`
        )
    // Ganador/perdedor desactualizado fuera de la lista aprobada: bloquea.
    const unexpected = [...unexpectedParticipants].sort()
    const missingCloses = config.closeTournamentIds.filter(
        (id) => !snapshot.tournaments.some((t) => idKey(t._id) === id)
    )

    const checks = [
        check(
            "outcomes a recalcular: exactamente los esperados",
            // Ya corregidos (0 ops) también es ok: idempotencia.
            (actualIds.length === 0 ||
                actualIds.join(",") === expectedIds.join(",")) &&
                !unexpected.length,
            [
                unexpected.length
                    ? `ganador/perdedor desactualizado fuera de la lista: ${unexpected.join(
                          ", "
                      )}`
                    : "",
                actualIds.length &&
                actualIds.join(",") !== expectedIds.join(",")
                    ? `encontrados: ${actualIds.join(", ") || "-"}`
                    : "",
            ]
                .filter(Boolean)
                .join("; ")
        ),
        check(
            "outcomes recalculados: sólo los campos e ids esperados",
            !wrongValue.length,
            wrongValue.join(", ")
        ),
        check(
            "torneos a cerrar existen",
            !missingCloses.length,
            missingCloses.join(", ")
        ),
        check(
            "vínculo por nombre: un único torneo homónimo",
            !linkProblems.length,
            linkProblems.join("; ")
        ),
    ]

    const linkedIds = ops
        .filter((op) => op.group.includes("link-by-name"))
        .map((op) => idKey(op._id))
    const notes = []
    if (linkedIds.length) {
        notes.push({
            kind: "linkByName",
            approved: true,
            ids: linkedIds,
            detail: Object.entries(linked)
                .map(
                    ([name, value]) =>
                        `${name} [${value.tournamentId || "-"}]: ${
                            value.matches
                        } partidos`
                )
                .join("; "),
            suggestion:
                "aprobado por el usuario; para vetarlo, sacar los nombres de linkByName antes del --apply",
        })
    }
    if (seedGaps.length) {
        notes.push({
            kind: "outcomeSeedGaps",
            deferred: true,
            ids: seedGaps.map((gap) => gap._id),
            detail: `${seedGaps.length} partidos jugados a los que les falta (o les difiere) outcome.seedFromTeamThatWon/Lost; los seeds no se tocan`,
            suggestion:
                "diferido por decisión del usuario: completar en una migración aparte si hace falta",
        })
    }

    return {
        ops,
        report: {
            summary: {
                scanned: {
                    matches: snapshot.matches.length,
                    tournaments: snapshot.tournaments.length,
                },
                toChange: ops.length,
                outcomeFixes,
                outcomeSeedGaps: seedGaps.length,
                closedTournaments: closed,
                nullTournamentToNull: nullReferences.length,
                linkedByName: linked,
            },
            byTournament: [],
            checks,
            needsConfirmation: [],
            notes,
            evidence: {
                outcomeSeedGaps: seedGaps,
                unexpectedOutcomeChanges: unexpectedEvidence,
            },
        },
    }
}

const createMigration = (options = {}) => ({
    id: ID,
    title: "M7: correcciones puntuales (outcomes, Chempions 2024, partidos sin torneo)",
    dependsOn: [],
    collections: [MATCHES, TOURNAMENTS],
    plan: (snapshot, context) => plan(snapshot, context, options),
})

module.exports = {
    ...createMigration(),
    DEFAULTS,
    createMigration,
}
