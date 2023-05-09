const { findFixtureByTournamentId } = require("./../../dao")

const retrieveFixtureByTournamentId = async (
    id,
    page,
    players,
    team,
    group
) => {
    return await findFixtureByTournamentId(id, page, players, team, group)
}

module.exports = retrieveFixtureByTournamentId
