const { groupBy } = require("es-toolkit/array")

const {
    calculateGroupStagePlayoff,
    orderMatchesFromTournamentById,
    retrieveTournamentById,
} = require("./../../service")
const FORMAT_CONFIGS = require("../../service/calculateGroupStagePlayoff/formats")
const { HttpError } = require("../../middleware/httpErrors")

const createGetPlayoffsPreviewByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const orderTournamentMatches =
        dependencies.orderMatchesFromTournamentById ||
        orderMatchesFromTournamentById
    const calculatePlayoff =
        dependencies.calculateGroupStagePlayoff || calculateGroupStagePlayoff
    const supportedFormats = dependencies.supportedFormats || FORMAT_CONFIGS

    return async (req, res) => {
        const { tournament } = req.params

        const tournamentDoc = await retrieveTournament(tournament)

        if (!tournamentDoc) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo indicado"
            )
        }

        const { format, teams = [] } = tournamentDoc

        // Sólo los formatos con bracket de fase de grupos tienen preview.
        // Antes, cualquier otro formato rompía al desestructurar la config.
        if (!supportedFormats[format]) {
            throw new HttpError(
                422,
                "UNSUPPORTED_TOURNAMENT_FORMAT",
                "El formato del torneo no tiene previsualización de cruces"
            )
        }

        const regularMatchesForPlayoffGeneration =
            (await orderTournamentMatches(tournament)) || []

        const teamsForPlayoffGeneration = groupBy(teams, (t) => t.group)

        const { playoffMatches, thirdsTable } = await calculatePlayoff(
            teamsForPlayoffGeneration,
            regularMatchesForPlayoffGeneration,
            format
        )

        return res.status(200).json({
            bracketPreview: playoffMatches,
            thirdsTable,
        })
    }
}

const getPlayoffsPreviewByTournamentId =
    createGetPlayoffsPreviewByTournamentId()

module.exports = getPlayoffsPreviewByTournamentId
module.exports.createGetPlayoffsPreviewByTournamentId =
    createGetPlayoffsPreviewByTournamentId
