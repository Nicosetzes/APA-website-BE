const buildPlayersOutput = ({ accumulators, includeLongestStreak }) =>
    accumulators
        .map((accumulator) => {
            const effectiveness = accumulator.played
                ? Number(
                      (
                          ((accumulator.wins * 3 + accumulator.draws) /
                              (accumulator.played * 3)) *
                          100
                      ).toFixed(2)
                  )
                : 0
            const player = {
                player: { id: accumulator.id, name: accumulator.name },
                wins: accumulator.wins,
                draws: accumulator.draws,
                losses: accumulator.losses,
                totalMatches: accumulator.played,
                goalsFor: accumulator.goalsFor,
                goalsAgainst: accumulator.goalsAgainst,
                scoringDifference:
                    (accumulator.goalsFor || 0) -
                    (accumulator.goalsAgainst || 0),
                effectiveness,
                current_streak: {
                    type: accumulator._curType,
                    length: accumulator._curLen,
                },
                recent: accumulator._recent.slice().reverse(),
                cleanSheets: accumulator.cleanSheets,
            }

            if (includeLongestStreak) {
                const bestType = [
                    { t: "W", v: accumulator._maxW },
                    { t: "D", v: accumulator._maxD },
                    { t: "L", v: accumulator._maxL },
                ].sort((a, b) => b.v - a.v)[0]
                player.longest_streak = bestType?.v
                    ? { type: bestType.t, length: bestType.v }
                    : { type: null, length: 0 }
            }

            return player
        })
        .sort((a, b) => b.totalMatches - a.totalMatches)

const buildLeaderboards = ({ players, accumulators }) => {
    const wins = [...players]
        .map((player) => ({
            player: player.player,
            wins: player.wins,
        }))
        .sort((a, b) => b.wins - a.wins)
    const goalsFor = [...players]
        .map((player) => ({
            player: player.player,
            goalsFor: player.goalsFor,
        }))
        .sort((a, b) => b.goalsFor - a.goalsFor)
    const matchesScoring3PlusGoals = accumulators
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            matchesScoring3PlusGoals: accumulator.matchesScoring3PlusGoals,
        }))
        .sort((a, b) => b.matchesScoring3PlusGoals - a.matchesScoring3PlusGoals)
    const cleanSheets = [...players]
        .map((player) => ({
            player: player.player,
            cleanSheets: player.cleanSheets,
        }))
        .sort((a, b) => b.cleanSheets - a.cleanSheets)
    const effectiveness = [...players]
        .map((player) => ({
            player: player.player,
            effectiveness: player.effectiveness,
        }))
        .sort((a, b) => b.effectiveness - a.effectiveness)
    const winPercentage = accumulators
        .filter((accumulator) => accumulator.played > 0)
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            winPercentage: Number(
                ((accumulator.wins / accumulator.played) * 100).toFixed(2)
            ),
        }))
        .sort((a, b) => b.winPercentage - a.winPercentage)
    const lossPercentage = accumulators
        .filter((accumulator) => accumulator.played > 0)
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            lossPercentage: Number(
                ((accumulator.losses / accumulator.played) * 100).toFixed(2)
            ),
        }))
        .sort((a, b) => a.lossPercentage - b.lossPercentage)
    const goalsForPerMatch = accumulators
        .filter((accumulator) => accumulator.played > 0)
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            goalsForPerMatch: Number(
                (accumulator.goalsFor / accumulator.played).toFixed(2)
            ),
        }))
        .sort((a, b) => b.goalsForPerMatch - a.goalsForPerMatch)
    const goalsAgainstPerMatch = accumulators
        .filter((accumulator) => accumulator.played > 0)
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            goalsAgainstPerMatch: Number(
                (accumulator.goalsAgainst / accumulator.played).toFixed(2)
            ),
        }))
        .sort((a, b) => a.goalsAgainstPerMatch - b.goalsAgainstPerMatch)
    const cleanSheetsPercentage = accumulators
        .filter((accumulator) => accumulator.played > 0)
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            cleanSheetsPercentage: Number(
                ((accumulator.cleanSheets / accumulator.played) * 100).toFixed(
                    2
                )
            ),
        }))
        .sort((a, b) => b.cleanSheetsPercentage - a.cleanSheetsPercentage)
    const penaltyWins = accumulators
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            penaltyWins: accumulator.penaltyWins,
        }))
        .sort((a, b) => b.penaltyWins - a.penaltyWins)
    const winsWithUniqueTeams = accumulators
        .map((accumulator) => ({
            player: { id: accumulator.id, name: accumulator.name },
            winsWithUniqueTeams: accumulator._uniqueTeamsWon.size,
        }))
        .sort((a, b) => b.winsWithUniqueTeams - a.winsWithUniqueTeams)

    return {
        wins,
        goalsFor,
        matchesScoring3PlusGoals,
        cleanSheets,
        effectiveness,
        winPercentage,
        lossPercentage,
        goalsForPerMatch,
        goalsAgainstPerMatch,
        cleanSheetsPercentage,
        penaltyWins,
        winsWithUniqueTeams,
    }
}

module.exports = { buildPlayersOutput, buildLeaderboards }
