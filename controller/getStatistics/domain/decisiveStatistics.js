const buildDecisiveMatchesStats = ({
    matches,
    playerNames,
    allowedPlayerIds,
}) => {
    const decisiveMatches = matches.filter((match) => {
        const type = String(match.type || "").toLowerCase()
        return type === "playoff" || type === "playin"
    })

    const accumulators = new Map()
    const ensure = (id) => {
        const key = String(id)
        if (!accumulators.has(key)) {
            accumulators.set(key, {
                id: key,
                name: playerNames.get(key) || key,
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                penaltyWins: 0,
                penaltyLosses: 0,
            })
        }
        return accumulators.get(key)
    }

    for (const match of decisiveMatches) {
        const player1Id = String(match.playerP1?.id || "")
        const player2Id = String(match.playerP2?.id || "")
        const score1 = Number(match.scoreP1) || 0
        const score2 = Number(match.scoreP2) || 0

        if (
            player1Id &&
            (!allowedPlayerIds || allowedPlayerIds.has(player1Id))
        ) {
            const player = ensure(player1Id)
            player.played += 1
            player.goalsFor += score1
            player.goalsAgainst += score2
            if (score1 === score2) {
                player.draws += 1
                if (match.outcome?.penalties) {
                    if (match.outcome?.playerThatWon?.id === player1Id) {
                        player.penaltyWins += 1
                    } else {
                        player.penaltyLosses += 1
                    }
                }
            } else if (score1 > score2) {
                player.wins += 1
            } else {
                player.losses += 1
            }
        }

        if (
            player2Id &&
            (!allowedPlayerIds || allowedPlayerIds.has(player2Id))
        ) {
            const player = ensure(player2Id)
            player.played += 1
            player.goalsFor += score2
            player.goalsAgainst += score1
            if (score1 === score2) {
                player.draws += 1
                if (match.outcome?.penalties) {
                    if (match.outcome?.playerThatWon?.id === player2Id) {
                        player.penaltyWins += 1
                    } else {
                        player.penaltyLosses += 1
                    }
                }
            } else if (score2 > score1) {
                player.wins += 1
            } else {
                player.losses += 1
            }
        }
    }

    return Array.from(accumulators.values())
        .map((player) => ({
            player: { id: player.id, name: player.name },
            played: player.played,
            wins: player.wins,
            draws: player.draws,
            losses: player.losses,
            goalsFor: player.goalsFor,
            goalsAgainst: player.goalsAgainst,
            goalDifference: player.goalsFor - player.goalsAgainst,
            penaltyWins: player.penaltyWins,
            penaltyLosses: player.penaltyLosses,
            winPercentage: player.played
                ? Number(((player.wins / player.played) * 100).toFixed(2))
                : 0,
        }))
        .sort((a, b) => b.played - a.played)
}

module.exports = { buildDecisiveMatchesStats }
