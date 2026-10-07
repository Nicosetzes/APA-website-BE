const { createStreakState, updateStreaks } = require("./streaks")
const { getPlayedAt, getPlayedAtPrecision } = require("../../../utils/playedAt")

const createAccumulator = ({ id, name }) => ({
    id,
    name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    cleanSheets: 0,
    penaltyWins: 0,
    matchesScoring3PlusGoals: 0,
    _uniqueTeamsWon: new Set(),
    _curType: null,
    _curLen: 0,
    _curDone: false,
    ...createStreakState(),
    _recent: [],
})

const aggregatePlayers = ({
    matches,
    registeredPlayers,
    playerNames,
    allowedPlayerIds,
}) => {
    // This Map and its entries are private mutable state; inputs remain untouched.
    const accumulators = new Map()
    const ensure = (id) => {
        const key = String(id)
        if (!accumulators.has(key)) {
            accumulators.set(
                key,
                createAccumulator({
                    id: key,
                    name: playerNames.get(key) || key,
                })
            )
        }
        return accumulators.get(key)
    }

    const processPerspective = ({
        match,
        playerId,
        goalsFor,
        goalsAgainst,
        team,
    }) => {
        if (
            !playerId ||
            (allowedPlayerIds && !allowedPlayerIds.has(playerId))
        ) {
            return
        }

        const accumulator = ensure(playerId)
        accumulator.played += 1
        accumulator.goalsFor += goalsFor
        accumulator.goalsAgainst += goalsAgainst
        if (goalsAgainst === 0) accumulator.cleanSheets += 1

        let result = "D"
        if (goalsFor === goalsAgainst) {
            accumulator.draws += 1
            result = "D"
            if (
                match.outcome?.penalties &&
                match.outcome?.playerThatWon?.id === playerId
            ) {
                accumulator.penaltyWins += 1
            }
        } else if (goalsFor > goalsAgainst) {
            accumulator.wins += 1
            result = "W"
            if (goalsFor >= 3) accumulator.matchesScoring3PlusGoals += 1
            const teamId = String(team?.id || team?.name || "")
            if (teamId) accumulator._uniqueTeamsWon.add(teamId)
        } else {
            accumulator.losses += 1
            result = "L"
        }

        updateStreaks({
            accumulator,
            result,
            goalsFor,
            goalsAgainst,
            match,
        })

        if (accumulator._recent.length < 10) {
            accumulator._recent.push({
                outcome: result.toLowerCase(),
                playerP1: match.playerP1,
                teamP1: match.teamP1,
                scoreP1: match.scoreP1,
                playerP2: match.playerP2,
                teamP2: match.teamP2,
                scoreP2: match.scoreP2,
                date: getPlayedAt(match) || null,
                datePrecision: getPlayedAtPrecision(match),
                tournament: match.tournament?.name || null,
            })
        }
    }

    for (const match of matches) {
        const playerP1Id = String(match.playerP1?.id || "")
        const playerP2Id = String(match.playerP2?.id || "")
        const scoreP1 = Number(match.scoreP1) || 0
        const scoreP2 = Number(match.scoreP2) || 0

        processPerspective({
            match,
            playerId: playerP1Id,
            goalsFor: scoreP1,
            goalsAgainst: scoreP2,
            team: match.teamP1,
        })
        processPerspective({
            match,
            playerId: playerP2Id,
            goalsFor: scoreP2,
            goalsAgainst: scoreP1,
            team: match.teamP2,
        })
    }

    for (const player of registeredPlayers) ensure(player.id)

    return Array.from(accumulators.values())
}

module.exports = { aggregatePlayers }
