const tournamentsModel = require("./../models/tournaments.js")

const updateTournamentOutcome = async (
    tournament,
    champion,
    finalist,
    options = {}
) => {
    return tournamentsModel.findByIdAndUpdate(
        tournament,
        {
            ongoing: false,
            outcome: { champion, finalist },
        },
        { ...options, new: true }
    )
}

module.exports = updateTournamentOutcome
