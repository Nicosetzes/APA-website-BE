const { createFixtureByTournamentId } = require("./../../dao")
const {
    fixtureGenerationWithoutGroups,
} = require("./../../fixture-generation/no-groups")
const {
    fixtureGenerationOneMatch,
} = require("./../../fixture-generation/with-groups/one-match")
const {
    fixtureGenerationTwoMatches,
} = require("./../../fixture-generation/with-groups/two-matches")

const originateFixtureByTournamentId = async (
    format,
    tournament,
    players,
    teams
) => {
    // Ejecuto una función o la otra dependiendo de si el torneo tiene grupos o no //

    let matches

    if (format == "champions_league")
        matches = fixtureGenerationTwoMatches(tournament, players, teams)
    else if (format == "world_cup" || format == "league_playin_playoff")
        matches = fixtureGenerationOneMatch(tournament, players, teams)
    else matches = fixtureGenerationWithoutGroups(tournament, players, teams)

    return await createFixtureByTournamentId(matches)
}

module.exports = originateFixtureByTournamentId
