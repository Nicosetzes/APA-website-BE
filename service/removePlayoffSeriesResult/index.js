const claimPlayoffSeriesRevision = require("../../dao/claimPlayoffSeriesRevision")
const deletePendingPlayoffTiebreak = require("../../dao/deletePendingPlayoffTiebreak")
const logger = require("../../utils/logger")
const findPlayoffSeriesByTie = require("../../dao/findPlayoffSeriesByTie")
const matchesModel = require("../../dao/models/matches")
const tournamentsModel = require("../../dao/models/tournaments")
const withTransaction = require("../../utils/withTransaction")
const { HttpError } = require("../../middleware/httpErrors")
const {
    assertSeriesStructure,
    classifySeriesMatch,
    decoratePlayoffSeriesMatches,
    deriveMutationPolicy,
    getSuccessorDescriptor,
} = require("../playoffSeries")

const conflict = (code, message) => new HttpError(409, code, message)
const isAlreadyClean = (match) =>
    match.played === false &&
    match.scoreP1 == null &&
    match.scoreP2 == null &&
    match.outcome == null

const createRemovePlayoffSeriesResult = (dependencies = {}) => {
    const Match = dependencies.matchesModel || matchesModel
    const Tournament = dependencies.tournamentsModel || tournamentsModel
    const findSeries =
        dependencies.findPlayoffSeriesByTie || findPlayoffSeriesByTie
    const claimRevision =
        dependencies.claimPlayoffSeriesRevision || claimPlayoffSeriesRevision
    const deleteTiebreak =
        dependencies.deletePendingPlayoffTiebreak ||
        deletePendingPlayoffTiebreak
    const runInTransaction = dependencies.withTransaction || withTransaction
    const log = dependencies.logger || logger

    return async ({
        tournamentId,
        matchId,
        expectedSeriesRevision,
        requestId = null,
    }) => {
        try {
            return await runInTransaction(async (session) => {
                const tournament = await Tournament.findById(
                    tournamentId
                ).session(session)
                if (!tournament)
                    throw new HttpError(
                        404,
                        "TOURNAMENT_NOT_FOUND",
                        "No se encontró el torneo"
                    )

                const match = await Match.findById(matchId).session(session)
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

                const tieMatches = Array.from(
                    await findSeries(tournament._id, match.playoff_id, {
                        session,
                    })
                )
                assertSeriesStructure(tournament, tieMatches)
                const canonical = tieMatches.find(({ leg }) => leg === 1)
                const descriptor = getSuccessorDescriptor(match.playoff_id)
                const successorMatches = descriptor
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

                if (isAlreadyClean(match)) {
                    return decoratePlayoffSeriesMatches(tournament, [
                        ...tieMatches,
                        ...successorMatches,
                    ]).find((item) => String(item._id) === String(matchId))
                }

                if (expectedSeriesRevision === undefined)
                    throw new HttpError(
                        400,
                        "EXPECTED_SERIES_REVISION_REQUIRED",
                        "La limpieza requiere la revisión vigente de la serie"
                    )
                if (canonical.seriesRevision !== expectedSeriesRevision)
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
                if (!policy.canDeleteResult)
                    throw conflict(
                        policy.reason === "later_leg_played"
                            ? "PLAYOFF_LATER_LEG_PLAYED"
                            : "PLAYOFF_SERIES_ADVANCED",
                        "La serie ya tiene resultados posteriores"
                    )

                const claimed = await claimRevision(
                    tournament._id,
                    match.playoff_id,
                    expectedSeriesRevision,
                    { session }
                )
                if (!claimed)
                    throw conflict(
                        "PLAYOFF_STATE_CONFLICT",
                        "La serie fue modificada por otra solicitud"
                    )

                const cleaned = await Match.findOneAndUpdate(
                    { _id: matchId, played: true },
                    {
                        $unset: {
                            scoreP1: 1,
                            scoreP2: 1,
                            outcome: 1,
                            valid: 1,
                        },
                        $set: { played: false },
                    },
                    { new: true, session }
                )
                if (!cleaned)
                    throw conflict(
                        "PLAYOFF_STATE_CONFLICT",
                        "El resultado fue modificado por otra solicitud"
                    )

                if (match.leg < 3) {
                    await deleteTiebreak(tournament._id, match.playoff_id, {
                        session,
                    })
                }

                const refreshedTie = Array.from(
                    await findSeries(tournament._id, match.playoff_id, {
                        session,
                    })
                )
                return decoratePlayoffSeriesMatches(tournament, [
                    ...refreshedTie,
                    ...successorMatches,
                ]).find((item) => String(item._id) === String(cleaned._id))
            })
        } catch (error) {
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
}

const removePlayoffSeriesResult = createRemovePlayoffSeriesResult()
module.exports = removePlayoffSeriesResult
module.exports.createRemovePlayoffSeriesResult = createRemovePlayoffSeriesResult
module.exports.isAlreadyClean = isAlreadyClean
