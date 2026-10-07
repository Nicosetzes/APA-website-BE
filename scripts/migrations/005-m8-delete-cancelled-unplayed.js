/*
 * M8: borra los partidos NO jugados de dos torneos cancelados (DESTRUCTIVA).
 *
 * Alcance cerrado (allowlist congelada, no configurable):
 *   - Liga Inglesa 2026 (695b007a9009908018bdc28f): 160 partidos, 47 jugados,
 *     113 no jugados a borrar;
 *   - Chempions 2024 (664d43458f37f00eba8ea380): 96 partidos, 10 jugados,
 *     86 no jugados a borrar.
 *   Total: 199. Los documentos de los torneos NO se borran.
 *
 * Candidato = partido con tournament.id (string) de la allowlist y
 * `played === false` (estricto: la app trata un `played` ausente como jugado,
 * `played: { $ne: false }`, así que un ausente nunca se borra y bloquea).
 * Una op por documento: { _id, "tournament.id", played: false }, de modo que
 * el filtro re-afirma las condiciones al escribir. Cualquier diferencia con
 * los conteos esperados bloquea (p. ej. si se jugó algo mientras tanto).
 * Ya aplicada (0 candidatos y sólo quedan los jugados) los checks pasan y da
 * 0 ops.
 *
 * El apply guarda los documentos completos en el before-file y el rollback
 * los re-inserta con su _id original (salteando los que ya existan).
 * Independiente de 001–004 (no lee nada que ellas cambien); va última.
 */

const { COLLECTIONS } = require("./lib/snapshot")
const { DELETE_KIND, cloneValue } = require("./lib/memory")

const ID = "005-m8-delete-cancelled-unplayed"
const MATCHES = COLLECTIONS.matches

const ALLOWLIST = Object.freeze([
    Object.freeze({
        key: "liga-inglesa-2026",
        tournamentId: "695b007a9009908018bdc28f",
        name: "Liga Inglesa 2026",
        expectedTotal: 160,
        expectedPlayed: 47,
        expectedToDelete: 113,
    }),
    Object.freeze({
        key: "chempions-2024",
        tournamentId: "664d43458f37f00eba8ea380",
        name: "Chempions 2024",
        expectedTotal: 96,
        expectedPlayed: 10,
        expectedToDelete: 86,
    }),
])
const EXPECTED_TOTAL_TO_DELETE = 199

const idKey = (value) =>
    value === null || value === undefined ? null : String(value)

const check = (name, ok, detail = "") => ({ name, ok: Boolean(ok), detail })

const listDetail = (ids) =>
    `${ids.slice(0, 20).join(", ")}${
        ids.length > 20 ? ` (+${ids.length - 20})` : ""
    }`

const isSet = (value) => value !== undefined && value !== null && value !== ""

const playedState = (match) => {
    if (match.played === true) return "true"
    if (match.played === false) return "false"
    if (match.played === undefined) return "absent"
    return "other"
}

// Ops de las migraciones anteriores (simuladas en el mismo dry-run) sobre
// documentos que M8 borra. Sólo informativo.
const overlapWithEarlier = (context, candidateIds) =>
    Object.fromEntries(
        Object.entries(context?.results || {}).map(([id, result]) => [
            id,
            (result.ops || []).filter(
                (op) =>
                    op.collection === MATCHES && candidateIds.has(idKey(op._id))
            ).length,
        ])
    )

const plan = (snapshot, context = {}) => {
    const allowed = new Map(
        ALLOWLIST.map((entry) => [entry.tournamentId, entry])
    )
    const tournamentsById = new Map(
        snapshot.tournaments.map((tournament) => [
            idKey(tournament._id),
            tournament,
        ])
    )

    const ops = []
    const perTournament = new Map(
        ALLOWLIST.map((entry) => [
            entry.tournamentId,
            {
                entry,
                total: 0,
                played: { true: 0, false: 0, absent: 0, other: 0 },
                candidates: [],
                byGroup: {},
                byType: {},
                nonStringTournamentId: [],
                withResultData: [],
                odd: [],
            },
        ])
    )
    // Pendientes de otros torneos: sólo para mostrar que no se tocan.
    const untouchedUnplayed = new Map()

    snapshot.matches.forEach((match) => {
        const tournamentId = idKey(match?.tournament?.id)
        const stats = tournamentId !== null && perTournament.get(tournamentId)
        if (!stats) {
            if (match.played !== true) {
                const key = tournamentId ?? "(sin torneo)"
                untouchedUnplayed.set(
                    key,
                    (untouchedUnplayed.get(key) || 0) + 1
                )
            }
            return
        }

        const id = idKey(match._id)
        const state = playedState(match)
        stats.total += 1
        stats.played[state] += 1
        const group = match.group ?? "-"
        stats.byGroup[group] = stats.byGroup[group] || {
            total: 0,
            played: 0,
            toDelete: 0,
        }
        stats.byGroup[group].total += 1
        if (state === "true") stats.byGroup[group].played += 1
        if (state === "absent" || state === "other") stats.odd.push(id)
        if (state !== "false") return

        // Sólo played === false llega acá.
        if (typeof match.tournament.id !== "string") {
            stats.nonStringTournamentId.push(id)
            return
        }
        if (
            isSet(match.scoreP1) ||
            isSet(match.scoreP2) ||
            isSet(match.outcome) ||
            isSet(match.playedAt)
        ) {
            stats.withResultData.push(id)
            return
        }

        stats.candidates.push(id)
        stats.byGroup[group].toDelete += 1
        stats.byType[match.type ?? "-"] =
            (stats.byType[match.type ?? "-"] || 0) + 1
        ops.push({
            kind: DELETE_KIND,
            collection: MATCHES,
            _id: match._id,
            filter: {
                _id: match._id,
                "tournament.id": stats.entry.tournamentId,
                played: false,
            },
            group: stats.entry.key,
            rule: `no jugado de ${stats.entry.name} (cancelado)`,
            before: cloneValue(match),
            after: null,
        })
    })

    const results = [...perTournament.values()]
    const checks = []

    const missingTournaments = ALLOWLIST.filter(
        (entry) => tournamentsById.get(entry.tournamentId)?.name !== entry.name
    ).map(
        (entry) =>
            `${entry.tournamentId} (${
                tournamentsById.get(entry.tournamentId)?.name ?? "no existe"
            })`
    )
    checks.push(
        check(
            "torneos de la allowlist existen con el nombre esperado",
            !missingTournaments.length,
            missingTournaments.join("; ")
        )
    )

    results.forEach((stats) => {
        const { entry } = stats
        const toDelete = stats.candidates.length
        const played = stats.played.true
        // Ya aplicada: no queda ningún no jugado y el total son los jugados.
        const alreadyApplied =
            toDelete === 0 &&
            stats.total === entry.expectedPlayed &&
            played === entry.expectedPlayed
        checks.push(
            check(
                `${entry.name}: ${entry.expectedToDelete} no jugados a borrar`,
                (toDelete === entry.expectedToDelete &&
                    stats.total === entry.expectedTotal) ||
                    alreadyApplied,
                `total ${stats.total}, a borrar ${toDelete}`
            ),
            check(
                `${entry.name}: jugados = ${entry.expectedPlayed}`,
                played === entry.expectedPlayed,
                `jugados ${played}`
            ),
            check(
                `${entry.name}: total después del borrado = ${entry.expectedPlayed}`,
                stats.total - toDelete === entry.expectedPlayed,
                `quedan ${stats.total - toDelete}`
            ),
            check(
                `${entry.name}: 0 partidos con played ausente o no booleano`,
                !stats.odd.length,
                listDetail(stats.odd)
            ),
            check(
                `${entry.name}: 0 no jugados con scores, outcome o playedAt`,
                !stats.withResultData.length,
                listDetail(stats.withResultData)
            ),
            check(
                `${entry.name}: tournament.id string en todos los no jugados`,
                !stats.nonStringTournamentId.length,
                listDetail(stats.nonStringTournamentId)
            )
        )
    })

    // Defensivo: por construcción no puede pasar, pero si pasa bloquea.
    const outside = ops.filter(
        (op) =>
            !allowed.has(op.filter["tournament.id"]) ||
            idKey(op.before?.tournament?.id) !== op.filter["tournament.id"] ||
            op.before?.played !== false
    )
    checks.push(
        check(
            "0 candidatos fuera de la allowlist o jugados",
            !outside.length,
            listDetail(outside.map((op) => idKey(op._id)))
        )
    )
    const total = ops.length
    const applied = results.every(
        (stats) =>
            stats.candidates.length === 0 &&
            stats.total === stats.entry.expectedPlayed
    )
    checks.push(
        check(
            `total a borrar = ${EXPECTED_TOTAL_TO_DELETE}`,
            total === EXPECTED_TOTAL_TO_DELETE || (total === 0 && applied),
            `a borrar ${total}`
        )
    )

    const byTournament = results.map((stats) => ({
        tournamentId: stats.entry.tournamentId,
        name: stats.entry.name,
        toChange: stats.candidates.length,
        byRule: {
            total: stats.total,
            played: stats.played.true,
            toDelete: stats.candidates.length,
            remainingAfter: stats.total - stats.candidates.length,
        },
    }))

    const groupsLeftEmpty = results.flatMap((stats) =>
        Object.entries(stats.byGroup)
            .filter(
                ([, value]) => value.total > 0 && value.total === value.toDelete
            )
            .map(([group]) => `${stats.entry.name} grupo ${group}`)
    )

    return {
        ops,
        report: {
            summary: {
                scanned: snapshot.matches.length,
                toDelete: total,
                expectedToDelete: EXPECTED_TOTAL_TO_DELETE,
                tournaments: results.map((stats) => ({
                    tournamentId: stats.entry.tournamentId,
                    name: stats.entry.name,
                    tournamentOngoing:
                        tournamentsById.get(stats.entry.tournamentId)
                            ?.ongoing ?? null,
                    total: stats.total,
                    playedValues: stats.played,
                    toDelete: stats.candidates.length,
                    remainingAfter: stats.total - stats.candidates.length,
                    byType: stats.byType,
                    byGroup: stats.byGroup,
                })),
                groupsLeftEmpty,
                untouchedUnplayedByTournament: Object.fromEntries(
                    [...untouchedUnplayed.entries()].sort()
                ),
            },
            byTournament,
            checks,
            needsConfirmation: [],
            notes: groupsLeftEmpty.length
                ? [
                      {
                          kind: "groupsLeftEmpty",
                          informational: true,
                          ids: [],
                          detail: `quedan sin partidos: ${groupsLeftEmpty.join(
                              ", "
                          )}`,
                          suggestion:
                              "el fixture del FE muestra 'aún no cuenta con partidos' y, a quien puede editar, el botón 'Generar partidos' para ese grupo",
                      },
                  ]
                : [],
            evidence: {
                overlapWithEarlierMigrations: overlapWithEarlier(
                    context,
                    new Set(ops.map((op) => idKey(op._id)))
                ),
                candidateIds: Object.fromEntries(
                    results.map((stats) => [
                        stats.entry.tournamentId,
                        stats.candidates,
                    ])
                ),
            },
        },
    }
}

const createMigration = () => ({
    id: ID,
    title: "M8: borrar partidos no jugados de 2 torneos cancelados (destructiva)",
    dependsOn: [],
    collections: [MATCHES],
    plan: (snapshot, context) => plan(snapshot, context),
})

module.exports = {
    ...createMigration(),
    ALLOWLIST,
    EXPECTED_TOTAL_TO_DELETE,
    createMigration,
}
