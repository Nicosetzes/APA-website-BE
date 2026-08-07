const {
    createPlayoffByTournamentId,
    updatePlayoffMatchTeams,
} = require("./../../dao")

// idStart(r) = startSize * (1 - 1/2^(r-1)) + 1,  matchCount(r) = startSize / 2^r
const generatePlayoffUpdate = async (tournament, matches, startSize) => {
    const totalRounds = Math.log2(startSize)

    const toCreate = []
    const toUpdate = []

    for (let r = 1; r < totalRounds; r++) {
        const feederStart = startSize * (1 - 1 / Math.pow(2, r - 1)) + 1
        const destStart = startSize * (1 - 1 / Math.pow(2, r)) + 1
        const destCount = startSize / Math.pow(2, r + 1)

        for (let k = 0; k < destCount; k++) {
            const srcId1 = feederStart + 2 * k
            const srcId2 = feederStart + 2 * k + 1
            const destId = destStart + k

            const src1 = matches.find((m) => m.playoff_id === srcId1)
            const src2 = matches.find((m) => m.playoff_id === srcId2)

            const src1Ready = src1?.played && src1?.outcome?.playerThatWon
            const src2Ready = src2?.played && src2?.outcome?.playerThatWon

            if (!src1Ready && !src2Ready) continue

            const dest = matches.find((m) => m.playoff_id === destId)

            if (!dest) {
                toCreate.push({
                    playerP1: src1Ready ? src1.outcome.playerThatWon : null,
                    teamP1: src1Ready ? src1.outcome.teamThatWon : null,
                    seedP1: src1Ready ? src1.outcome.seedFromTeamThatWon : null,
                    playerP2: src2Ready ? src2.outcome.playerThatWon : null,
                    teamP2: src2Ready ? src2.outcome.teamThatWon : null,
                    seedP2: src2Ready ? src2.outcome.seedFromTeamThatWon : null,
                    type: "playoff",
                    tournament,
                    played: false,
                    playoff_id: destId,
                })
            } else {
                const updateFields = {}

                if (src1Ready && !dest.playerP1) {
                    updateFields.playerP1 = src1.outcome.playerThatWon
                    updateFields.teamP1 = src1.outcome.teamThatWon
                    updateFields.seedP1 = src1.outcome.seedFromTeamThatWon
                }
                if (src2Ready && !dest.playerP2) {
                    updateFields.playerP2 = src2.outcome.playerThatWon
                    updateFields.teamP2 = src2.outcome.teamThatWon
                    updateFields.seedP2 = src2.outcome.seedFromTeamThatWon
                }

                if (Object.keys(updateFields).length) {
                    toUpdate.push({ playoffId: destId, fields: updateFields })
                }
            }
        }
    }

    const created = toCreate.length
        ? await createPlayoffByTournamentId(toCreate)
        : []

    const updated = await Promise.all(
        toUpdate.map(({ playoffId, fields }) =>
            updatePlayoffMatchTeams(tournament.id, playoffId, fields)
        )
    )

    return { created, updated: updated.filter(Boolean) }
}

module.exports = generatePlayoffUpdate
