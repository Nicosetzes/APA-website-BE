const { createFixtureByTournamentId } = require("./../../dao")
const {
    fixtureGenerationWithoutGroups,
} = require("./../../fixture-generation/no-groups")
const {
    fixtureGenerationWithGroups,
} = require("./../../fixture-generation/with-groups")

const originateFixtureByTournamentId = async (
    tournament,
    players,
    teams,
    groups
) => {
    // Ejecuto una función o la otra dependiendo de si el torneo tiene grupos o no //

    const matches = groups
        ? fixtureGenerationWithGroups(tournament, players, teams)
        : fixtureGenerationWithoutGroups(tournament, players, teams)

    return await createFixtureByTournamentId(matches)
}

module.exports = originateFixtureByTournamentId
