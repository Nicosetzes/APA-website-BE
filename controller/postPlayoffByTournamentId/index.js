const { createPlayoffByTournamentId } = require("./../../dao")
const { groupBy } = require("es-toolkit/array")

const {
    calculateGroupStagePlayoff,
    orderMatchesFromTournamentById,
    originateChampionsLeaguePlayoffByTournamentId,
    originatePlayoffWithPlayinByTournamentId,
    originateWorldCupPlayoffByTournamentId,
    retrievePlayinMatchesByTournamentId,
    retrievePlayoffMatchesByTournamentId,
    retrieveTournamentById,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const MANUAL_PLAYOFF_FORMATS = new Set([
    "champions_league",
    "league_playin_playoff",
    "world_cup",
    "world_cup_2026",
    "super_cup",
])

const isPlayinComplete = (matches) => {
    const matchById = new Map(matches.map((match) => [match.playoff_id, match]))

    return [1, 2, 3, 4, 5, 6].every((id) => {
        const match = matchById.get(id)
        return (
            match?.played === true &&
            match.outcome?.playerThatWon &&
            match.outcome?.teamThatWon
        )
    })
}

const hasValidAssignments = (teams) =>
    Array.isArray(teams) &&
    teams.length > 0 &&
    teams.every(
        (entry) =>
            entry?.group &&
            entry.team?.id !== undefined &&
            entry.player?.id !== undefined
    )

const createPostPlayoffByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrievePlayoffMatches =
        dependencies.retrievePlayoffMatchesByTournamentId ||
        retrievePlayoffMatchesByTournamentId
    const retrieveRegularMatches =
        dependencies.orderMatchesFromTournamentById ||
        orderMatchesFromTournamentById
    const retrievePlayinMatches =
        dependencies.retrievePlayinMatchesByTournamentId ||
        retrievePlayinMatchesByTournamentId
    const createChampionsPlayoff =
        dependencies.originateChampionsLeaguePlayoffByTournamentId ||
        originateChampionsLeaguePlayoffByTournamentId
    const createPlayoffWithPlayin =
        dependencies.originatePlayoffWithPlayinByTournamentId ||
        originatePlayoffWithPlayinByTournamentId
    const createWorldCupPlayoff =
        dependencies.originateWorldCupPlayoffByTournamentId ||
        originateWorldCupPlayoffByTournamentId
    const calculateGroupPlayoff =
        dependencies.calculateGroupStagePlayoff || calculateGroupStagePlayoff
    const persistPlayoff =
        dependencies.createPlayoffByTournamentId || createPlayoffByTournamentId

    return async (req, res) => {
        const { tournament } = req.params
        const tournamentData = await retrieveTournament(tournament)

        if (!tournamentData) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo"
            )
        }

        const existingPlayoffMatches = await retrievePlayoffMatches(tournament)
        if (existingPlayoffMatches.length > 0) {
            throw new HttpError(
                409,
                "PLAYOFF_ALREADY_EXISTS",
                "El playoff de este torneo ya fue generado"
            )
        }

        const { id, name, format, teams } = tournamentData
        if (!MANUAL_PLAYOFF_FORMATS.has(format)) {
            throw new HttpError(
                422,
                "PLAYOFF_UNSUPPORTED_TOURNAMENT",
                format === "playoff"
                    ? "El bracket de este formato se genera al crear el torneo"
                    : "El formato del torneo no admite generación manual de playoff"
            )
        }
        if (!hasValidAssignments(teams)) {
            throw new HttpError(
                422,
                "PLAYOFF_PARTICIPANTS_INVALID",
                "Las asignaciones del torneo no permiten generar el playoff"
            )
        }

        const tournamentReference = { id, name }
        const regularMatches = await retrieveRegularMatches(tournament)
        const teamsByGroup = groupBy(teams, (entry) => entry.group)
        let playoff

        if (format === "league_playin_playoff") {
            const playinMatches = await retrievePlayinMatches(tournament)
            if (!isPlayinComplete(playinMatches)) {
                throw new HttpError(
                    409,
                    "PLAYOFF_NOT_READY",
                    "Aún restan partidos de play-in"
                )
            }

            playoff = await createPlayoffWithPlayin(
                tournamentReference,
                teamsByGroup,
                regularMatches,
                playinMatches
            )
        } else if (format === "world_cup") {
            playoff = await createWorldCupPlayoff(
                tournamentReference,
                teamsByGroup,
                regularMatches
            )
        } else if (format === "world_cup_2026" || format === "super_cup") {
            const calculation = calculateGroupPlayoff(
                teamsByGroup,
                regularMatches,
                format
            )
            const playoffMatches = calculation?.playoffMatches
            if (!Array.isArray(playoffMatches) || playoffMatches.length === 0) {
                throw new HttpError(
                    422,
                    "PLAYOFF_DATA_INVALID",
                    "Los datos del torneo no permiten generar el playoff"
                )
            }

            playoff = await persistPlayoff(
                playoffMatches.map((match) => ({
                    ...match,
                    played: false,
                    tournament: tournamentReference,
                    type: "playoff",
                }))
            )
        } else {
            playoff = await createChampionsPlayoff(
                tournamentReference,
                teamsByGroup,
                regularMatches
            )
        }

        return res.status(200).json(playoff)
    }
}

const postPlayoffByTournamentId = createPostPlayoffByTournamentId()

module.exports = postPlayoffByTournamentId
module.exports.createPostPlayoffByTournamentId = createPostPlayoffByTournamentId
module.exports.hasValidAssignments = hasValidAssignments
module.exports.isPlayinComplete = isPlayinComplete
