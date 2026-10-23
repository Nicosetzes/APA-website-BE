const matchesModel = require("./../models/matches.js")

const PROJECTION = [
    "type",
    "group",
    "playoff_id",
    "leg",
    "played",
    "valid",
    "playedAt",
    "playedAtPrecision",
    "scoreP1",
    "scoreP2",
    "playerP1.id",
    "playerP1.name",
    "playerP2.id",
    "playerP2.name",
    "teamP1.id",
    "teamP1.name",
    "teamP2.id",
    "teamP2.name",
    "seedP1",
    "seedP2",
    "seriesRevision",
    "outcome",
    "tournament.id",
].join(" ")

const findTournamentMatchesForRecap = async (tournamentId) =>
    matchesModel
        .find(
            { "tournament.id": String(tournamentId), played: { $ne: false } },
            PROJECTION
        )
        .lean()

module.exports = findTournamentMatchesForRecap
module.exports.PROJECTION = PROJECTION
