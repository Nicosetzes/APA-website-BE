const {
    originateFixtureByTournamentId,
    retrieveTournamentById,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

const createPostFixtureByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const originateFixture =
        dependencies.originateFixtureByTournamentId ||
        originateFixtureByTournamentId

    return async (req, res) => {
        const { group } = req.body
        const { tournament } = req.params
        const tournamentData = await retrieveTournament(tournament)

        if (!tournamentData) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo"
            )
        }

        const { id, name, players, teams, groups, format } = tournamentData
        const tournamentReference = { id, name }
        let teamsForFixture
        let playersForFixture

        if (groups?.length) {
            const selectedGroup = group || "A"
            teamsForFixture = teams.filter(
                (entry) => entry.group === selectedGroup
            )
            const playerIds = [
                ...new Set(teamsForFixture.map((entry) => entry.player.id)),
            ]

            playersForFixture = playerIds.map((playerId) => {
                const player = players.find(
                    (entry) => String(entry.id) === String(playerId)
                )

                if (!player) {
                    throw new HttpError(
                        422,
                        "TOURNAMENT_PARTICIPANTS_INVALID",
                        "El torneo contiene asignaciones de jugadores inválidas"
                    )
                }

                return { id: playerId, name: player.name }
            })
        } else {
            playersForFixture = players
            teamsForFixture = teams
        }

        const fixture = await originateFixture(
            format,
            tournamentReference,
            playersForFixture,
            teamsForFixture
        )

        return res.status(200).json(fixture)
    }
}

const postFixtureByTournamentId = createPostFixtureByTournamentId()

module.exports = postFixtureByTournamentId
module.exports.createPostFixtureByTournamentId = createPostFixtureByTournamentId
