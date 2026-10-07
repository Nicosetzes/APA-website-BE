/*
 * M3: startedAt / closedAt de los torneos (plan de normalización, ítem 5.5).
 * Depende de M2 (playedAt de los partidos) y de M7 (partidos vinculados por
 * nombre y Chempions 2024 cerrado): en dry-run ve el snapshot con esas ops
 * simuladas.
 *   startedAt = mínimo playedAt de sus jugados, con esa precisión; legacy sin
 *               jugados -> createdAt "year"; no legacy sin jugados -> nada.
 *   closedAt  = sólo ongoing:false: override explícito de
 *               data/played-at-overrides.json (tournamentClosedAt: torneo ->
 *               partido fuente) -> playedAt de ese partido; si no, final
 *               jugada (valid:false incluida) -> su playedAt; si no, máximo
 *               playedAt; legacy sin jugados -> createdAt "year".
 */

const { getFinalPlayoffId } = require("../../config/playoffFormats")
const DEFAULT_OVERRIDES = require("./data/played-at-overrides.json")
const { canonicalKey } = require("./lib/ejson")
const { describeUpdate, getPath } = require("./lib/memory")
const { COLLECTIONS } = require("./lib/snapshot")
const m7 = require("./002-m7-point-fixes")

const ID = "003-m3-tournament-dates"
const M2_ID = "001-m2-played-at"
const TOURNAMENTS = COLLECTIONS.tournaments

const idKey = (value) =>
    value === null || value === undefined ? null : String(value)

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const iso = (time) => (time === null ? null : new Date(time).toISOString())

const check = (name, ok, detail = "") => ({ name, ok: Boolean(ok), detail })

const compareIdAsc = (a, b) => {
    const left = String(a._id)
    const right = String(b._id)
    if (left === right) return 0
    return left < right ? -1 : 1
}

const isFinalMatch = (match, format) =>
    match.type === "playoff" &&
    Number(match.playoff_id) === getFinalPlayoffId(format) &&
    (match.leg === undefined || match.leg === null || Number(match.leg) === 1)

const fromMatch = (match, rule) => ({
    value: new Date(toTime(match.playedAt)),
    precision: match.playedAtPrecision ?? "exact",
    matchId: idKey(match._id),
    rule,
})

const listDetail = (ids) =>
    `${ids.slice(0, 20).join(", ")}${
        ids.length > 20 ? ` (+${ids.length - 20})` : ""
    }`

// Partidos que M2 marcó como agregados tardíos (nota o a confirmar).
const lateAdditionIds = (context) => {
    const report = context?.results?.[M2_ID]?.report || {}
    return new Set(
        [...(report.needsConfirmation || []), ...(report.notes || [])]
            .filter((item) => item.kind === "lateAddition")
            .flatMap((item) => item.ids || [])
    )
}

const plan = (snapshot, context = {}, options = {}) => {
    const linkByName = options.linkByName || m7.DEFAULTS.linkByName
    const closedAtOverrides = new Map(
        ((options.overrides || DEFAULT_OVERRIDES).tournamentClosedAt || []).map(
            (entry) => [entry.tournamentId, entry]
        )
    )
    const late = lateAdditionIds(context)
    const overrideProblems = []
    const overrideEvidence = []

    const playedByTournament = new Map()
    snapshot.matches.forEach((match) => {
        const key = idKey(match?.tournament?.id)
        if (key === null || match.played !== true) return
        if (!playedByTournament.has(key)) playedByTournament.set(key, [])
        playedByTournament.get(key).push(match)
    })

    const ops = []
    const samples = {}
    const proposals = []
    const withoutPlayedAt = []
    const needsConfirmation = []
    const usedOverrides = new Set()

    snapshot.tournaments.forEach((tournament) => {
        const tournamentId = idKey(tournament._id)
        const played = (playedByTournament.get(tournamentId) || []).sort(
            compareIdAsc
        )
        const dated = played.filter((match) => toTime(match.playedAt) !== null)
        played
            .filter((match) => toTime(match.playedAt) === null)
            .forEach((match) => withoutPlayedAt.push(idKey(match._id)))

        const legacyDate =
            tournament.legacy === true && toTime(tournament.createdAt) !== null
                ? {
                      value: new Date(toTime(tournament.createdAt)),
                      precision: "year",
                      matchId: null,
                      rule: "legacy createdAt",
                  }
                : null

        // Mínimo / máximo con desempate por _id asc (determinístico).
        const earliest = dated.reduce(
            (best, match) =>
                !best || toTime(match.playedAt) < toTime(best.playedAt)
                    ? match
                    : best,
            null
        )
        const latest = dated.reduce(
            (best, match) =>
                !best || toTime(match.playedAt) > toTime(best.playedAt)
                    ? match
                    : best,
            null
        )

        const started = earliest
            ? fromMatch(earliest, "min playedAt")
            : legacyDate
        let closed = null
        const override = closedAtOverrides.get(tournamentId)
        if (override) {
            usedOverrides.add(tournamentId)
            const source = dated.find(
                (match) => idKey(match._id) === override.matchId
            )
            if (tournament.ongoing !== false) {
                overrideProblems.push(`${tournament.name}: no está terminado`)
            } else if (!source) {
                overrideProblems.push(
                    `${tournament.name}: ${override.matchId} no es un jugado con playedAt del torneo`
                )
            } else {
                closed = fromMatch(source, "closedAt override")
                // El partido fuente tiene que ser el último que cuenta.
                const laterValid = dated
                    .filter(
                        (match) =>
                            match.valid !== false &&
                            toTime(match.playedAt) > toTime(source.playedAt)
                    )
                    .map((match) => idKey(match._id))
                if (laterValid.length) {
                    overrideProblems.push(
                        `${tournament.name}: hay válidos posteriores a ${
                            override.matchId
                        }: ${listDetail(laterValid)}`
                    )
                }
                const skipped = dated.filter(
                    (match) => toTime(match.playedAt) > toTime(source.playedAt)
                )
                overrideEvidence.push({
                    tournamentId,
                    name: tournament.name,
                    matchId: override.matchId,
                    type: source.type,
                    playoff_id: source.playoff_id,
                    valid: source.valid,
                    closedAt: iso(toTime(source.playedAt)),
                    precision: closed.precision,
                    laterMatches: skipped.map((match) => ({
                        matchId: idKey(match._id),
                        type: match.type,
                        playoff_id: match.playoff_id,
                        valid: match.valid,
                        playedAt: iso(toTime(match.playedAt)),
                    })),
                })
            }
        }
        if (tournament.ongoing === false && !closed) {
            const finalMatch = dated.find((match) =>
                isFinalMatch(match, tournament.format)
            )
            if (finalMatch) closed = fromMatch(finalMatch, "final")
            else if (latest) closed = fromMatch(latest, "max playedAt")
            else closed = legacyDate
        }

        proposals.push({ tournament, started, closed, played: played.length })

        const $set = {}
        const setIfDiffers = (field, proposal) => {
            if (!proposal) return
            const precisionField = `${field}Precision`
            if (
                toTime(tournament[field]) !== proposal.value.getTime() ||
                !(tournament[field] instanceof Date)
            ) {
                $set[field] = proposal.value
            }
            if (tournament[precisionField] !== proposal.precision) {
                $set[precisionField] = proposal.precision
            }
        }
        setIfDiffers("startedAt", started)
        setIfDiffers("closedAt", closed)

        if (closed?.matchId && late.has(closed.matchId)) {
            const alternative = dated
                .filter((match) => !late.has(idKey(match._id)))
                .reduce(
                    (best, match) =>
                        !best || toTime(match.playedAt) > toTime(best.playedAt)
                            ? match
                            : best,
                    null
                )
            needsConfirmation.push({
                kind: "closedAtFromLateAddition",
                ids: [tournamentId, closed.matchId],
                detail: `${tournament.name}: closedAt ${iso(
                    closed.value.getTime()
                )} sale de ${closed.matchId} (${
                    closed.rule
                }), marcado como agregado tardío por ${M2_ID}`,
                suggestion: alternative
                    ? `alternativa: máximo de los no tardíos, ${iso(
                          toTime(alternative.playedAt)
                      )} (${idKey(alternative._id)})`
                    : "no hay partidos no tardíos para usar de alternativa",
            })
        }

        const paths = Object.keys($set)
        if (!paths.length) return

        const update = { $set }
        const group = tournament.legacy === true ? "legacy" : "from-matches"
        const rule = [
            started ? `startedAt=${started.rule}` : null,
            closed ? `closedAt=${closed.rule}` : null,
        ]
            .filter(Boolean)
            .join("; ")
        const filter = {
            _id: tournament._id,
            ...Object.fromEntries(
                paths.map((path) => {
                    const value = getPath(tournament, path)
                    return [
                        path,
                        value === undefined ? { $exists: false } : value,
                    ]
                })
            ),
        }
        const op = {
            collection: TOURNAMENTS,
            _id: tournament._id,
            filter,
            update,
            group,
            rule,
            ...describeUpdate(tournament, update),
        }
        ops.push(op)
        samples[group] = samples[group] || []
        samples[group].push({
            _id: tournamentId,
            collection: TOURNAMENTS,
            name: tournament.name,
            before: op.before,
            after: op.after,
            rule,
        })
    })

    // Valor resultante: el propuesto o, si no hay propuesta, el guardado.
    const effective = (proposal, key, field) => {
        if (proposal[key]) return proposal[key]
        const current = proposal.tournament[field]
        return current instanceof Date
            ? {
                  value: current,
                  precision: proposal.tournament[`${field}Precision`],
              }
            : null
    }
    const startedOf = (proposal) => effective(proposal, "started", "startedAt")
    const closedOf = (proposal) => effective(proposal, "closed", "closedAt")

    const legacyMismatch = proposals
        .filter(({ tournament }) => tournament.legacy === true)
        .filter((proposal) => {
            const created = toTime(proposal.tournament.createdAt)
            return (
                startedOf(proposal)?.value.getTime() !== created ||
                closedOf(proposal)?.value.getTime() !== created
            )
        })
        .map(({ tournament }) => idKey(tournament._id))
    const inverted = proposals
        .filter((proposal) => {
            const start = startedOf(proposal)?.value.getTime()
            const close = closedOf(proposal)?.value.getTime()
            return start !== undefined && close !== undefined && close < start
        })
        .map(({ tournament }) => idKey(tournament._id))
    const finishedWithoutClose = proposals
        .filter(({ tournament }) => tournament.ongoing === false)
        .filter((proposal) => !closedOf(proposal))
        .map(({ tournament }) => idKey(tournament._id))
    const linkedWithoutDates = proposals
        .filter(({ tournament }) => linkByName.includes(tournament.name))
        .filter(
            (proposal) =>
                proposal.played === 0 ||
                !startedOf(proposal) ||
                (proposal.tournament.ongoing === false && !closedOf(proposal))
        )
        .map(({ tournament }) => idKey(tournament._id))

    closedAtOverrides.forEach((entry, tournamentId) => {
        if (!usedOverrides.has(tournamentId)) {
            overrideProblems.push(`torneo ${tournamentId} no existe`)
        }
    })

    const checks = [
        check(
            "closedAt overrides: partido fuente jugado del torneo y último válido",
            !overrideProblems.length,
            overrideProblems.join("; ")
        ),
        check(
            "legacy: startedAt == closedAt == createdAt",
            !legacyMismatch.length,
            listDetail(legacyMismatch)
        ),
        check(
            "ningún closedAt anterior a su startedAt",
            !inverted.length,
            listDetail(inverted)
        ),
        check(
            "todos los ongoing:false tienen closedAt",
            !finishedWithoutClose.length,
            listDetail(finishedWithoutClose)
        ),
        check(
            "torneos vinculados por nombre toman fechas de sus partidos",
            !linkedWithoutDates.length,
            listDetail(linkedWithoutDates)
        ),
        check(
            "0 partidos jugados con torneo y sin playedAt",
            !withoutPlayedAt.length,
            listDetail(withoutPlayedAt)
        ),
    ]

    const byTournament = proposals.map(({ tournament, started, closed }) => {
        const op = ops.find(
            (item) => canonicalKey(item._id) === canonicalKey(tournament._id)
        )
        return {
            tournamentId: idKey(tournament._id),
            name: tournament.name,
            toChange: op ? 1 : 0,
            byRule: {
                startedAt: started
                    ? `${iso(started.value.getTime())} ${started.precision} (${
                          started.rule
                      })`
                    : null,
                closedAt: closed
                    ? `${iso(closed.value.getTime())} ${closed.precision} (${
                          closed.rule
                      })`
                    : null,
            },
        }
    })

    return {
        ops,
        report: {
            summary: {
                scanned: snapshot.tournaments.length,
                toChange: ops.length,
                withStartedAt: proposals.filter((p) => startedOf(p)).length,
                withClosedAt: proposals.filter((p) => closedOf(p)).length,
                finished: proposals.filter(
                    ({ tournament }) => tournament.ongoing === false
                ).length,
            },
            byTournament,
            checks,
            needsConfirmation,
            evidence: { closedAtOverrides: overrideEvidence },
            samples,
        },
    }
}

const createMigration = (options = {}) => ({
    id: ID,
    title: "M3: startedAt / closedAt de los torneos",
    dependsOn: [M2_ID, m7.id],
    collections: [TOURNAMENTS],
    plan: (snapshot, context) => plan(snapshot, context, options),
})

module.exports = { ...createMigration(), createMigration }
