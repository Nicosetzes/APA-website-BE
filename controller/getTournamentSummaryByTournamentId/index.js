const {
    retrieveTournamentById,
    retrieveAllPlayedMatchesByTournamentId,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const calculateParticipantStats = (players, matches) => {
    const statsByPlayer = new Map()

    players.forEach((player) => {
        statsByPlayer.set(String(player.id), {
            player: {
                id: player.id,
                name: player.name,
                nickname: player.nickname,
            },
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            currentType: null,
            currentLength: 0,
            currentDone: false,
        })
    })

    const applyResult = (stats, goalsFor, goalsAgainst) => {
        stats.played += 1
        stats.goalsFor += goalsFor
        stats.goalsAgainst += goalsAgainst

        let result
        if (goalsFor === goalsAgainst) {
            stats.draws += 1
            result = "D"
        } else if (goalsFor > goalsAgainst) {
            stats.wins += 1
            result = "W"
        } else {
            stats.losses += 1
            result = "L"
        }

        if (!stats.currentDone) {
            if (stats.currentType === null) {
                stats.currentType = result
                stats.currentLength = 1
            } else if (stats.currentType === result) {
                stats.currentLength += 1
            } else {
                stats.currentDone = true
            }
        }
    }

    matches.forEach((match) => {
        const player1 = statsByPlayer.get(String(match.playerP1?.id || ""))
        const player2 = statsByPlayer.get(String(match.playerP2?.id || ""))
        const score1 = Number(match.scoreP1) || 0
        const score2 = Number(match.scoreP2) || 0

        if (player1) applyResult(player1, score1, score2)
        if (player2) applyResult(player2, score2, score1)
    })

    return [...statsByPlayer.values()]
        .map((stats) => ({
            player: stats.player,
            played: stats.played,
            wins: stats.wins,
            draws: stats.draws,
            losses: stats.losses,
            goalsFor: stats.goalsFor,
            goalsAgainst: stats.goalsAgainst,
            scoringDifference: stats.goalsFor - stats.goalsAgainst,
            effectiveness:
                stats.played > 0
                    ? Number(
                          (
                              ((stats.wins * 3 + stats.draws) /
                                  (stats.played * 3)) *
                              100
                          ).toFixed(2)
                      )
                    : 0,
            streak:
                stats.currentType && stats.currentLength > 0
                    ? `${stats.currentLength}${stats.currentType}`
                    : null,
        }))
        .sort((left, right) => right.played - left.played)
}

const buildTournamentSummary = (tournament, playedMatches) => {
    const sortedMatches = [...playedMatches].sort((left, right) => {
        const leftDate = left.updatedAt ? new Date(left.updatedAt) : new Date(0)
        const rightDate = right.updatedAt
            ? new Date(right.updatedAt)
            : new Date(0)
        return rightDate - leftDate
    })
    const recent = sortedMatches.slice(0, 6).map((match) => ({
        id: match._id,
        playerP1: match.playerP1,
        teamP1: match.teamP1,
        scoreP1: match.scoreP1,
        playerP2: match.playerP2,
        teamP2: match.teamP2,
        scoreP2: match.scoreP2,
        outcome: match.outcome,
        type: match.type,
        updatedAt: match.updatedAt,
    }))
    const players = Array.isArray(tournament.players) ? tournament.players : []
    const summary = {
        tournament: { id: tournament.id, name: tournament.name },
        matches: {
            recent,
            totalPlayed: sortedMatches.length,
        },
        participants: calculateParticipantStats(players, sortedMatches),
    }

    if (!tournament.ongoing && tournament.outcome) {
        summary.outcome = {
            champion: tournament.outcome.champion,
            finalist: tournament.outcome.finalist,
        }
    }

    return summary
}

const createGetTournamentSummaryByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrievePlayedMatches =
        dependencies.retrieveAllPlayedMatchesByTournamentId ||
        retrieveAllPlayedMatchesByTournamentId

    return async (req, res) => {
        const { tournament } = req.params
        const tournamentDoc = await retrieveTournament(tournament)

        if (!tournamentDoc) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo"
            )
        }

        const playedMatches = await retrievePlayedMatches(tournament, false)
        const summary = buildTournamentSummary(tournamentDoc, playedMatches)

        return res.status(200).json(summary)
    }
}

const getTournamentSummaryByTournamentId =
    createGetTournamentSummaryByTournamentId()

module.exports = getTournamentSummaryByTournamentId
module.exports.buildTournamentSummary = buildTournamentSummary
module.exports.calculateParticipantStats = calculateParticipantStats
module.exports.createGetTournamentSummaryByTournamentId =
    createGetTournamentSummaryByTournamentId
