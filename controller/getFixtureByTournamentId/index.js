const {
    decorateMatchesWithPrediction,
} = require("../../service/playerRatings/prediction")
const defaultLogger = require("../../utils/logger")
const {
    retrieveFixtureByTournamentId,
    retrieveRatingMatches,
    retrieveStoredPredictionIndex,
} = require("./../../service")

const createGetFixtureByTournamentId = (dependencies = {}) => {
    const retrieveFixture =
        dependencies.retrieveFixtureByTournamentId ||
        retrieveFixtureByTournamentId

    const retrieveEveryMatch =
        dependencies.retrieveAllMatches || retrieveRatingMatches
    const logger = dependencies.logger || defaultLogger
    // Lector de ratings persistidos por defecto, salvo que se inyecte solo el
    // lector en vivo: así los tests que inyectan `retrieveAllMatches` no tocan
    // el DAO real.
    const retrieveStoredIndex =
        dependencies.retrieveStoredPredictionIndex ??
        (dependencies.retrieveAllMatches
            ? undefined
            : retrieveStoredPredictionIndex)

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

        if (!Array.isArray(fixture?.matches) || fixture.matches.length === 0) {
            return res.status(200).send(fixture)
        }

        // Agrega victoria / empate / derrota (APA Rating 2.0) a cada partido de
        // liga. Todos los partidos del fixture son `regular`.
        const matches = await decorateMatchesWithPrediction({
            matches: fixture.matches,
            tournament: { _id: tournament },
            retrieveAllMatches: retrieveEveryMatch,
            retrieveStoredIndex,
            readModelEnabled: dependencies.readModelEnabled,
            logger,
            options: dependencies.predictionOptions,
        })

        return res.status(200).send({ ...fixture, matches })
    }
}

const getFixtureByTournamentId = createGetFixtureByTournamentId()

module.exports = getFixtureByTournamentId
module.exports.createGetFixtureByTournamentId = createGetFixtureByTournamentId
