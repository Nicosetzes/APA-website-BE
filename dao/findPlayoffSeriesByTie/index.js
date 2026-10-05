const matchesModel = require("../models/matches")

const findPlayoffSeriesByTie = async (
    tournamentId,
    playoffId,
    { session } = {}
) => {
    const query = matchesModel
        .find({
            "tournament.id": String(tournamentId),
            type: "playoff",
            playoff_id: Number(playoffId),
            leg: { $in: [1, 2, 3] },
        })
        .sort({ leg: 1, _id: 1 })
    if (session) query.session(session)
    return query
}

module.exports = findPlayoffSeriesByTie
