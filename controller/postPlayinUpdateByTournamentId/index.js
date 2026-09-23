const {
    originatePlayinByTournamentId,
    retrieveTournamentById,
    retrievePlayinMatchesByTournamentId,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const hasOutcome = (match) =>
    match?.played === true &&
    match.outcome?.playerThatWon &&
    match.outcome?.teamThatWon &&
    match.outcome?.seedFromTeamThatWon &&
    match.outcome?.playerThatLost &&
    match.outcome?.teamThatLost &&
    match.outcome?.seedFromTeamThatLost

const createPlayinMap = (matches) => {
    const matchById = new Map()

    matches.forEach((match) => {
        const id = Number(match.playoff_id)
        if (matchById.has(id)) {
            throw new HttpError(
                409,
                "PLAYIN_STATE_CONFLICT",
                "El play-in contiene partidos duplicados"
            )
        }
        matchById.set(id, match)
    })

    return matchById
}

const buildSecondRoundMatch = (
    matchById,
    firstSourceId,
    secondSourceId,
    destinationId,
    tournament
) => {
    if (matchById.has(destinationId)) return null

    const first = matchById.get(firstSourceId)
    const second = matchById.get(secondSourceId)
    if (!first?.played || !second?.played) return null

    if (!hasOutcome(first) || !hasOutcome(second)) {
        throw new HttpError(
            422,
            "PLAYIN_DATA_INVALID",
            "Los partidos jugados no tienen outcomes válidos"
        )
    }

    return {
        playerP1: first.outcome.playerThatLost,
        teamP1: first.outcome.teamThatLost,
        seedP1: first.outcome.seedFromTeamThatLost,
        playerP2: second.outcome.playerThatWon,
        teamP2: second.outcome.teamThatWon,
        seedP2: second.outcome.seedFromTeamThatWon,
        type: "playin",
        tournament,
        played: false,
        playoff_id: destinationId,
        group: first.group,
    }
}

const createPostPlayinUpdateByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrieveMatches =
        dependencies.retrievePlayinMatchesByTournamentId ||
        retrievePlayinMatchesByTournamentId
    const originatePlayin =
        dependencies.originatePlayinByTournamentId ||
        originatePlayinByTournamentId

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
        if (tournamentData.format !== "league_playin_playoff") {
            throw new HttpError(
                422,
                "PLAYIN_UNSUPPORTED_TOURNAMENT",
                "El torneo no admite play-in"
            )
        }

        const matches = await retrieveMatches(tournament)
        const matchById = createPlayinMap(matches)
        const tournamentReference = {
            id: tournamentData.id,
            name: tournamentData.name,
        }
        const newMatches = [
            buildSecondRoundMatch(matchById, 1, 2, 5, tournamentReference),
            buildSecondRoundMatch(matchById, 3, 4, 6, tournamentReference),
        ].filter(Boolean)

        if (newMatches.length === 0) {
            const alreadyGenerated = matchById.has(5) && matchById.has(6)
            throw new HttpError(
                409,
                alreadyGenerated
                    ? "PLAYIN_ROUND_ALREADY_GENERATED"
                    : "PLAYIN_ROUND_NOT_READY",
                alreadyGenerated
                    ? "La segunda ronda ya fue generada"
                    : "La primera ronda todavía no está completa"
            )
        }

        const newPlayinMatches = await originatePlayin(newMatches)
        return res.status(200).json(newPlayinMatches)
    }
}

const postPlayinUpdateByTournamentId = createPostPlayinUpdateByTournamentId()

module.exports = postPlayinUpdateByTournamentId
module.exports.buildSecondRoundMatch = buildSecondRoundMatch
module.exports.createPlayinMap = createPlayinMap
module.exports.createPostPlayinUpdateByTournamentId =
    createPostPlayinUpdateByTournamentId
