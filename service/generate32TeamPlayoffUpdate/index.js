const { createPlayoffByTournamentId } = require("./../../dao")

const generate32TeamPlayoffUpdate = async (round, tournament, matches) => {
    const playedMatches = matches
        .filter(({ played }) => played)
        .map(({ playoff_id }) => playoff_id)

    const newMatches = []

    if (round == 2) {
        // Round of 16 (after Round of 32)
        // playoff_ids 1-16 → create playoff_ids 17-24
        const pairs = [
            [1, 2, 17],
            [3, 4, 18],
            [5, 6, 19],
            [7, 8, 20],
            [9, 10, 21],
            [11, 12, 22],
            [13, 14, 23],
            [15, 16, 24],
        ]

        pairs.forEach(([id1, id2, newId]) => {
            if (playedMatches.includes(id1) && playedMatches.includes(id2)) {
                const match1 = matches.find((m) => m.playoff_id === id1)
                const match2 = matches.find((m) => m.playoff_id === id2)

                if (
                    match1?.outcome?.playerThatWon &&
                    match2?.outcome?.playerThatWon &&
                    !matches.some((m) => m.playoff_id === newId)
                ) {
                    newMatches.push({
                        playerP1: match1.outcome.playerThatWon,
                        teamP1: match1.outcome.teamThatWon,
                        seedP1: match1.outcome.seedFromTeamThatWon,
                        playerP2: match2.outcome.playerThatWon,
                        teamP2: match2.outcome.teamThatWon,
                        seedP2: match2.outcome.seedFromTeamThatWon,
                        type: "playoff",
                        tournament,
                        played: false,
                        playoff_id: newId,
                    })
                }
            }
        })
    } else if (round == 3) {
        // Quarterfinals (after Round of 16)
        // playoff_ids 17-24 → create playoff_ids 25-28
        const pairs = [
            [17, 18, 25],
            [19, 20, 26],
            [21, 22, 27],
            [23, 24, 28],
        ]

        pairs.forEach(([id1, id2, newId]) => {
            if (playedMatches.includes(id1) && playedMatches.includes(id2)) {
                const match1 = matches.find((m) => m.playoff_id === id1)
                const match2 = matches.find((m) => m.playoff_id === id2)

                if (
                    match1?.outcome?.playerThatWon &&
                    match2?.outcome?.playerThatWon &&
                    !matches.some((m) => m.playoff_id === newId)
                ) {
                    newMatches.push({
                        playerP1: match1.outcome.playerThatWon,
                        teamP1: match1.outcome.teamThatWon,
                        seedP1: match1.outcome.seedFromTeamThatWon,
                        playerP2: match2.outcome.playerThatWon,
                        teamP2: match2.outcome.teamThatWon,
                        seedP2: match2.outcome.seedFromTeamThatWon,
                        type: "playoff",
                        tournament,
                        played: false,
                        playoff_id: newId,
                    })
                }
            }
        })
    } else if (round == 4) {
        // Semifinals (after Quarterfinals)
        // playoff_ids 25-28 → create playoff_ids 29-30
        const pairs = [
            [25, 26, 29],
            [27, 28, 30],
        ]

        pairs.forEach(([id1, id2, newId]) => {
            if (playedMatches.includes(id1) && playedMatches.includes(id2)) {
                const match1 = matches.find((m) => m.playoff_id === id1)
                const match2 = matches.find((m) => m.playoff_id === id2)

                if (
                    match1?.outcome?.playerThatWon &&
                    match2?.outcome?.playerThatWon &&
                    !matches.some((m) => m.playoff_id === newId)
                ) {
                    newMatches.push({
                        playerP1: match1.outcome.playerThatWon,
                        teamP1: match1.outcome.teamThatWon,
                        seedP1: match1.outcome.seedFromTeamThatWon,
                        playerP2: match2.outcome.playerThatWon,
                        teamP2: match2.outcome.teamThatWon,
                        seedP2: match2.outcome.seedFromTeamThatWon,
                        type: "playoff",
                        tournament,
                        played: false,
                        playoff_id: newId,
                    })
                }
            }
        })
    } else if (round == 5) {
        // Final (after Semifinals)
        // playoff_ids 29-30 → create playoff_id 31
        if (playedMatches.includes(29) && playedMatches.includes(30)) {
            const match1 = matches.find((m) => m.playoff_id === 29)
            const match2 = matches.find((m) => m.playoff_id === 30)

            if (
                match1?.outcome?.playerThatWon &&
                match2?.outcome?.playerThatWon &&
                !matches.some((m) => m.playoff_id === 31)
            ) {
                newMatches.push({
                    playerP1: match1.outcome.playerThatWon,
                    teamP1: match1.outcome.teamThatWon,
                    seedP1: match1.outcome.seedFromTeamThatWon,
                    playerP2: match2.outcome.playerThatWon,
                    teamP2: match2.outcome.teamThatWon,
                    seedP2: match2.outcome.seedFromTeamThatWon,
                    type: "playoff",
                    tournament,
                    played: false,
                    playoff_id: 31,
                })
            }
        }
    }

    return await createPlayoffByTournamentId(newMatches)
}

module.exports = generate32TeamPlayoffUpdate
