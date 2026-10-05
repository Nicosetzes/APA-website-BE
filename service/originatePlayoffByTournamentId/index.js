const { createPlayoffByTournamentId } = require("./../../dao")
const {
    assertDirectPlayoffGeometry,
    buildLegsForTie,
} = require("../playoffSeries")

const originatePlayoffByTournamentId = async (
    tournament,
    teams,
    options = {}
) => {
    assertDirectPlayoffGeometry(teams, tournament.players)

    const teamsByPlayoffId = new Map()
    for (const { team, player, playoff_id: playoffId } of teams) {
        if (!teamsByPlayoffId.has(playoffId))
            teamsByPlayoffId.set(playoffId, [])
        teamsByPlayoffId.get(playoffId).push({ team, player })
    }

    const playoffMatches = []
    for (let playoffId = 1; playoffId <= 16; playoffId += 1) {
        const [left, right] = teamsByPlayoffId.get(playoffId)
        playoffMatches.push(
            ...buildLegsForTie({
                tournament,
                playoffId,
                unitA: {
                    ...left,
                    seed: `${playoffId}A`,
                },
                unitB: {
                    ...right,
                    seed: `${playoffId}B`,
                },
            })
        )
    }

    const created = await createPlayoffByTournamentId(playoffMatches, {
        ...options,
        ordered: true,
    })
    if (created.length !== playoffMatches.length) {
        const error = new Error("No se pudo crear el cuadro completo")
        error.code = "PLAYOFF_CREATION_INCOMPLETE"
        throw error
    }

    return created
}

module.exports = originatePlayoffByTournamentId
