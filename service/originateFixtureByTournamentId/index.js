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
const { HttpError } = require("../../middleware/httpErrors")

const ensureGeneratedFixture = (matches) => {
    if (!Array.isArray(matches)) {
        throw new HttpError(
            422,
            "FIXTURE_GENERATION_FAILED",
            "No se pudo generar el fixture con las asignaciones actuales"
        )
    }

    return matches
}

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
    else if (
        format == "league_playin_playoff" ||
        format == "super_cup" ||
        format == "world_cup" ||
        format == "world_cup_2026"
    )
        matches = fixtureGenerationOneMatch(tournament, players, teams)
    else matches = fixtureGenerationWithoutGroups(teams, players, tournament)

    ensureGeneratedFixture(matches)

    return await createFixtureByTournamentId(matches)
}

module.exports = originateFixtureByTournamentId
module.exports.ensureGeneratedFixture = ensureGeneratedFixture
