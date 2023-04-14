const { findFixtureByTournamentIds } = require("./../../dao")

const retrieveFixtureByTournamentIds = async (ids, page, players, team) => {
    return await findFixtureByTournamentIds(ids, page, players, team)
}

module.exports = retrieveFixtureByTournamentIds
