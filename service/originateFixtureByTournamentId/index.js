const { createFixtureByTournamentId } = require("./../../dao")
const {
    fixtureGenerationByGroup,
} = require("./../../fixture-generation-by-group")

const originateFixtureByTournamentId = async (tournament, players, teams) => {
    const matches = fixtureGenerationByGroup(tournament, players, teams)

    return await createFixtureByTournamentId(matches)
}

module.exports = originateFixtureByTournamentId
