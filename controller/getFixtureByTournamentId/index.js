const { retrieveFixtureByTournamentId } = require("./../../service")

const createGetFixtureByTournamentId = (dependencies = {}) => {
    const retrieveFixture =
        dependencies.retrieveFixtureByTournamentId ||
        retrieveFixtureByTournamentId

    return async (req, res) => {
        const { tournament } = req.params
        const { page, team, group, players } = req.query
        const fixture = await retrieveFixture(
            tournament,
            page,
            players,
            team,
            group
        )

        return res.status(200).send(fixture)
    }
}

const getFixtureByTournamentId = createGetFixtureByTournamentId()

module.exports = getFixtureByTournamentId
module.exports.createGetFixtureByTournamentId = createGetFixtureByTournamentId
