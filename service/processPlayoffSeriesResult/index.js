const { HttpError } = require("../../middleware/httpErrors")
const claimPlayoffSeriesRevision = require("../../dao/claimPlayoffSeriesRevision")
const deletePendingPlayoffTiebreak = require("../../dao/deletePendingPlayoffTiebreak")
const findPlayoffSeriesByTie = require("../../dao/findPlayoffSeriesByTie")
const logger = require("../../utils/logger")
const matchesModel = require("../../dao/models/matches")
const tournamentsModel = require("../../dao/models/tournaments")
const updatePlayoffSeriesMatchResult = require("../../dao/updatePlayoffSeriesMatchResult")
const updatePlayoffSeriesSlots = require("../../dao/updatePlayoffSeriesSlots")
const withTransaction = require("../../utils/withTransaction")
const { resolvePlayedAtOnResult } = require("../../utils/playedAt")
const {
    assertSeriesStructure,
    buildLegsForTie,
    calculatePhysicalOutcome,
    calculateSeriesState,
    classifySeriesMatch,
    decoratePlayoffSeriesMatches,
    deriveMutationPolicy,
    getSuccessorDescriptor,
    isPhysicalResultEquivalent,
    sameUnit,
    toCompetitorUnit,
    validateSeriesResultRequest,
} = require("../playoffSeries")

const asPlain = (value) =>
    typeof value?.toObject === "function" ? value.toObject() : value

const conflict = (code, message) => new HttpError(409, code, message)

const outcomeMatchesWinner = (outcome, winner, loser) =>
    String(outcome?.champion?.team?.id ?? "") ===
        String(winner?.team?.id ?? "") &&
    String(outcome?.champion?.player?.id ?? "") ===
        String(winner?.player?.id ?? "") &&
    String(outcome?.finalist?.team?.id ?? "") ===
        String(loser?.team?.id ?? "") &&
    String(outcome?.finalist?.player?.id ?? "") ===
        String(loser?.player?.id ?? "")

const hasEquivalentDerivedState = ({
    tournament,
    match,
    tieMatches,
    successorMatches,
    body,
    outcome,
}) => {
    if (!isPhysicalResultEquivalent(match, body, outcome)) return false

    const simulated = tieMatches.map((item) =>
        String(item._id) === String(match._id)
            ? {
                  ...asPlain(item),
                  scoreP1: Number(body.scoreP1),
                  scoreP2: Number(body.scoreP2),
                  outcome,
                  played: true,
                  ...(body.valid !== undefined ? { valid: body.valid } : {}),
              }
            : item
    )
    const state = calculateSeriesState(simulated)
    const tiebreak = tieMatches.find(({ leg }) => leg === 3)

    if (state.status === "awaiting_tiebreak") return Boolean(tiebreak)
    if (state.status !== "decided" || !state.winner) return !tiebreak
    if (
        tiebreak &&
        state.aggregate.length === 2 &&
        state.aggregate[0].score !== state.aggregate[1].score
    ) {
        return false
    }

    const descriptor = getSuccessorDescriptor(match.playoff_id)
    if (!descriptor) {
        const units = [
            toCompetitorUnit(tieMatches[0], "P1"),
            toCompetitorUnit(tieMatches[0], "P2"),
        ]
        const loser = units.find((unit) => !sameUnit(unit, state.winner))
        return (
            tournament.ongoing === false &&
            outcomeMatchesWinner(tournament.outcome, state.winner, loser)
        )
    }

    const canonical = successorMatches.find(({ leg }) => leg === 1)
    if (
        !sameUnit(
            toCompetitorUnit(canonical, descriptor.logicalSide),
            state.winner
        )
    )
        return false

    if (successorMatches.length === 2) {
        const mirrorSide = descriptor.logicalSide === "P1" ? "P2" : "P1"
        const returnLeg = successorMatches.find(({ leg }) => leg === 2)
        if (!sameUnit(toCompetitorUnit(returnLeg, mirrorSide), state.winner))
            return false
    }

    return true
}

const createProcessPlayoffSeriesResult = (dependencies = {}) => {
    const Match = dependencies.matchesModel || matchesModel
    const Tournament = dependencies.tournamentsModel || tournamentsModel
    const findSeries =
        dependencies.findPlayoffSeriesByTie || findPlayoffSeriesByTie
    const claimRevision =
        dependencies.claimPlayoffSeriesRevision || claimPlayoffSeriesRevision
    const updateResult =
        dependencies.updatePlayoffSeriesMatchResult ||
        updatePlayoffSeriesMatchResult
    const updateSlots =
        dependencies.updatePlayoffSeriesSlots || updatePlayoffSeriesSlots
    const deleteTiebreak =
        dependencies.deletePendingPlayoffTiebreak ||
        deletePendingPlayoffTiebreak
    const runInTransaction = dependencies.withTransaction || withTransaction
    const log = dependencies.logger || logger

    return async ({ tournamentId, matchId, body, requestId = null }) => {
        const execute = ({ concurrentRetry = false } = {}) =>
            runInTransaction(async (session) => {
                const tournament = await Tournament.findById(
                    tournamentId
                ).session(session)
                const match = await Match.findById(matchId).session(session)
                if (!tournament)
                    throw new HttpError(
                        404,
                        "TOURNAMENT_NOT_FOUND",
                        "No se encontró el torneo"
                    )
                if (!match)
                    throw new HttpError(
                        404,
                        "MATCH_NOT_FOUND",
                        "No se encontró el partido"
                    )

                const classification = classifySeriesMatch({
                    tournament,
                    match,
                })
                if (!["series_leg", "decisive"].includes(classification))
                    throw conflict(
                        "PLAYOFF_CONFIGURATION_ERROR",
                        "El partido no pertenece a una serie administrada"
                    )

                let tieMatches = await findSeries(
                    tournament._id,
                    match.playoff_id,
                    { session }
                )
                tieMatches = Array.from(tieMatches)
                assertSeriesStructure(tournament, tieMatches)
                validateSeriesResultRequest({
                    tournament,
                    match,
                    tieMatches,
                    body,
                })

                const outcome = calculatePhysicalOutcome({
                    match,
                    body,
                    decisive: classification === "decisive",
                })
                const canonical = tieMatches.find(({ leg }) => leg === 1)
                const descriptor = getSuccessorDescriptor(match.playoff_id)
                let successorMatches = descriptor
                    ? Array.from(
                          await findSeries(
                              tournament._id,
                              descriptor.destinationPlayoffId,
                              { session }
                          )
                      )
                    : []
                if (successorMatches.length)
                    assertSeriesStructure(tournament, successorMatches)

                if (
                    hasEquivalentDerivedState({
                        tournament,
                        match,
                        tieMatches,
                        successorMatches,
                        body,
                        outcome,
                    })
                ) {
                    const decorated = decoratePlayoffSeriesMatches(tournament, [
                        ...tieMatches,
                        ...successorMatches,
                    ])
                    return decorated.find(
                        (item) => String(item._id) === String(matchId)
                    )
                }

                const expected = body.expectedSeriesRevision
                if (match.played && expected === undefined) {
                    if (concurrentRetry)
                        throw conflict(
                            "PLAYOFF_STATE_CONFLICT",
                            "Otra solicitud guardó un resultado diferente"
                        )
                    throw new HttpError(
                        400,
                        "EXPECTED_SERIES_REVISION_REQUIRED",
                        "La edición requiere la revisión vigente de la serie"
                    )
                }
                if (
                    expected !== undefined &&
                    expected !== canonical.seriesRevision
                )
                    throw conflict(
                        "PLAYOFF_STATE_CONFLICT",
                        "La serie fue modificada por otra solicitud"
                    )

                const policy = deriveMutationPolicy({
                    match,
                    tieMatches,
                    successorMatches,
                    tournament,
                })
                if (!policy.canEditResult)
                    throw conflict(
                        policy.reason === "later_leg_played"
                            ? "PLAYOFF_LATER_LEG_PLAYED"
                            : "PLAYOFF_SERIES_ADVANCED",
                        "La serie ya tiene resultados posteriores"
                    )

                const claimed = await claimRevision(
                    tournament._id,
                    match.playoff_id,
                    canonical.seriesRevision,
                    { session }
                )
                if (!claimed)
                    throw conflict(
                        "PLAYOFF_STATE_CONFLICT",
                        "La serie fue modificada por otra solicitud"
                    )

                // playedAt sólo va en el resultado del partido cargado; las
                // piernas hermanas, el desempate y los slots no lo reciben.
                const updated = await updateResult(
                    matchId,
                    {
                        scoreP1: Number(body.scoreP1),
                        scoreP2: Number(body.scoreP2),
                        outcome,
                        played: true,
                        ...(body.valid !== undefined
                            ? { valid: Boolean(body.valid) }
                            : {}),
                        ...resolvePlayedAtOnResult(match, new Date()),
                    },
                    {
                        session,
                        requirePending: !match.played && expected === undefined,
                    }
                )
                if (!updated)
                    throw conflict(
                        "PLAYOFF_STATE_CONFLICT",
                        "El resultado fue modificado por otra solicitud"
                    )

                tieMatches = tieMatches.map((item) =>
                    String(item._id) === String(matchId) ? updated : item
                )
                const state = calculateSeriesState(tieMatches)
                const existingTiebreak = tieMatches.find(({ leg }) => leg === 3)

                if (state.status === "awaiting_tiebreak" && !existingTiebreak) {
                    const first = tieMatches.find(({ leg }) => leg === 1)
                    await Match.insertMany(
                        [
                            {
                                playerP1: first.playerP1,
                                teamP1: first.teamP1,
                                seedP1: first.seedP1,
                                playerP2: first.playerP2,
                                teamP2: first.teamP2,
                                seedP2: first.seedP2,
                                type: "playoff",
                                tournament: first.tournament,
                                played: false,
                                playoff_id: first.playoff_id,
                                leg: 3,
                            },
                        ],
                        { ordered: true, session }
                    )
                } else if (
                    state.status !== "awaiting_tiebreak" &&
                    existingTiebreak &&
                    !existingTiebreak.played
                ) {
                    await deleteTiebreak(tournament._id, match.playoff_id, {
                        session,
                    })
                }

                if (state.status === "decided" && state.winner) {
                    if (!descriptor) {
                        const loser = [
                            toCompetitorUnit(tieMatches[0], "P1"),
                            toCompetitorUnit(tieMatches[0], "P2"),
                        ].find((unit) => !sameUnit(unit, state.winner))
                        const result = await Tournament.updateOne(
                            { _id: tournament._id, ongoing: { $ne: false } },
                            {
                                $set: {
                                    ongoing: false,
                                    outcome: {
                                        champion: {
                                            team: state.winner.team,
                                            player: state.winner.player,
                                        },
                                        finalist: {
                                            team: loser.team,
                                            player: loser.player,
                                        },
                                    },
                                    // El cierre toma la fecha del partido
                                    // que decidió la final (D3).
                                    closedAt: updated.playedAt ?? new Date(),
                                    closedAtPrecision: updated.playedAt
                                        ? updated.playedAtPrecision ?? "exact"
                                        : "exact",
                                },
                            },
                            { session }
                        )
                        if (result.modifiedCount !== 1)
                            throw conflict(
                                "PLAYOFF_STATE_CONFLICT",
                                "El cierre del torneo fue modificado"
                            )
                    } else if (!successorMatches.length) {
                        const units =
                            descriptor.logicalSide === "P1"
                                ? [state.winner, null]
                                : [null, state.winner]
                        await Match.insertMany(
                            buildLegsForTie({
                                tournament,
                                playoffId: descriptor.destinationPlayoffId,
                                unitA: units[0],
                                unitB: units[1],
                            }),
                            { ordered: true, session }
                        )
                    } else {
                        const destinationCanonical = successorMatches.find(
                            ({ leg }) => leg === 1
                        )
                        const side = descriptor.logicalSide
                        if (destinationCanonical[`team${side}`])
                            throw conflict(
                                "PLAYOFF_SERIES_ADVANCED",
                                "La serie ya avanzó"
                            )

                        const destinationClaim = await claimRevision(
                            tournament._id,
                            descriptor.destinationPlayoffId,
                            destinationCanonical.seriesRevision,
                            { session }
                        )
                        if (!destinationClaim)
                            throw conflict(
                                "PLAYOFF_STATE_CONFLICT",
                                "La llave siguiente cambió"
                            )

                        const mirror = side === "P1" ? "P2" : "P1"
                        const updates = [
                            {
                                leg: 1,
                                emptyTeamField: `team${side}`,
                                fields: {
                                    [`team${side}`]: state.winner.team,
                                    [`player${side}`]: state.winner.player,
                                    [`seed${side}`]: state.winner.seed,
                                },
                            },
                            ...(successorMatches.length === 2
                                ? [
                                      {
                                          leg: 2,
                                          emptyTeamField: `team${mirror}`,
                                          fields: {
                                              [`team${mirror}`]:
                                                  state.winner.team,
                                              [`player${mirror}`]:
                                                  state.winner.player,
                                              [`seed${mirror}`]:
                                                  state.winner.seed,
                                          },
                                      },
                                  ]
                                : []),
                        ]
                        const results = await updateSlots(
                            tournament._id,
                            descriptor.destinationPlayoffId,
                            updates,
                            { session }
                        )
                        if (
                            results.some(
                                ({ modifiedCount }) => modifiedCount !== 1
                            )
                        )
                            throw conflict(
                                "PLAYOFF_SLOT_CONFLICT",
                                "El slot de destino ya está ocupado"
                            )
                    }
                }

                const refreshedTie = Array.from(
                    await findSeries(tournament._id, match.playoff_id, {
                        session,
                    })
                )
                const refreshedSuccessor = descriptor
                    ? Array.from(
                          await findSeries(
                              tournament._id,
                              descriptor.destinationPlayoffId,
                              { session }
                          )
                      )
                    : []
                const refreshedTournament = await Tournament.findById(
                    tournamentId
                ).session(session)
                return decoratePlayoffSeriesMatches(refreshedTournament, [
                    ...refreshedTie,
                    ...refreshedSuccessor,
                ]).find((item) => String(item._id) === String(matchId))
            })

        let retryReason = null
        try {
            return await execute()
        } catch (error) {
            if (
                error?.code === 11000 ||
                error?.code === "PLAYOFF_STATE_CONFLICT"
            ) {
                retryReason = error.code
            } else {
                if (error?.code === "PLAYOFF_CONFIGURATION_ERROR") {
                    log.warn("playoff_series_configuration_error", {
                        requestId,
                        tournamentId,
                        matchId,
                        code: error.code,
                    })
                }
                throw error
            }
        }

        try {
            return await execute({ concurrentRetry: true })
        } catch (error) {
            if (error?.code === 11000)
                throw conflict(
                    "PLAYOFF_DUPLICATE_LEG",
                    "Otra solicitud creó la misma pierna de playoff"
                )
            if (
                retryReason === 11000 &&
                error?.code === "PLAYOFF_STATE_CONFLICT"
            )
                throw conflict(
                    "PLAYOFF_DUPLICATE_LEG",
                    "La creación concurrente de la pierna no pudo converger"
                )
            throw error
        }
    }
}

const processPlayoffSeriesResult = createProcessPlayoffSeriesResult()

module.exports = processPlayoffSeriesResult
module.exports.createProcessPlayoffSeriesResult =
    createProcessPlayoffSeriesResult
module.exports.hasEquivalentDerivedState = hasEquivalentDerivedState
