const {
    createPlayinByTournamentId,
    updatePlayinMatchTeams,
} = require("./../../dao")
// Un destino ya jugado recalcula su outcome al cambiar participantes (D6).
const { withRecomputedOutcome } = require("../../utils/matchOutcome")

const PLAYIN_PROGRESSION = [
    { loserFrom: 1, winnerFrom: 2, destination: 5 },
    { loserFrom: 3, winnerFrom: 4, destination: 6 },
]

const loserSide = (match) =>
    match?.played &&
    match.outcome?.playerThatLost &&
    match.outcome?.teamThatLost
        ? {
              player: match.outcome.playerThatLost,
              team: match.outcome.teamThatLost,
              seed: match.outcome.seedFromTeamThatLost,
          }
        : null

const winnerSide = (match) =>
    match?.played && match.outcome?.playerThatWon && match.outcome?.teamThatWon
        ? {
              player: match.outcome.playerThatWon,
              team: match.outcome.teamThatWon,
              seed: match.outcome.seedFromTeamThatWon,
          }
        : null

const sideFields = (side, suffix) => ({
    [`player${suffix}`]: side.player,
    [`team${suffix}`]: side.team,
    [`seed${suffix}`]: side.seed,
})

const generatePlayinUpdate = async (tournament, matches, options = {}) => {
    const matchById = new Map(
        matches.map((match) => [Number(match.playoff_id), match])
    )

    const toCreate = []
    const toUpdate = []

    for (const { loserFrom, winnerFrom, destination } of PLAYIN_PROGRESSION) {
        const loserSource = matchById.get(loserFrom)
        const winnerSource = matchById.get(winnerFrom)
        const p1 = loserSide(loserSource)
        const p2 = winnerSide(winnerSource)

        if (!p1 && !p2) continue

        const dest = matchById.get(destination)

        if (!dest) {
            toCreate.push({
                playerP1: p1?.player ?? null,
                teamP1: p1?.team ?? null,
                seedP1: p1?.seed ?? null,
                playerP2: p2?.player ?? null,
                teamP2: p2?.team ?? null,
                seedP2: p2?.seed ?? null,
                type: "playin",
                tournament,
                played: false,
                playoff_id: destination,
                group: loserSource?.group ?? winnerSource?.group,
            })
            continue
        }

        const fields = {
            ...(p1 && !dest.playerP1 ? sideFields(p1, "P1") : {}),
            ...(p2 && !dest.playerP2 ? sideFields(p2, "P2") : {}),
        }

        if (Object.keys(fields).length) {
            toUpdate.push({
                playoffId: destination,
                fields: withRecomputedOutcome(dest, fields),
            })
        }
    }

    const created = toCreate.length
        ? await createPlayinByTournamentId(toCreate, options)
        : []

    const updated = []
    for (const { playoffId, fields } of toUpdate) {
        const result = await updatePlayinMatchTeams(
            tournament.id,
            playoffId,
            fields,
            options
        )
        if (result) updated.push(result)
    }

    return { created, updated }
}

module.exports = generatePlayinUpdate
module.exports.PLAYIN_PROGRESSION = PLAYIN_PROGRESSION
