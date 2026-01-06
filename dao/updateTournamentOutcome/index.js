const tournamentsModel = require("./../models/tournaments.js")

const updateTournamentOutcome = async (tournament, champion, finalist) => {
    const updatedTournament = await tournamentsModel.findByIdAndUpdate(
        tournament,
        {
            ongoing: false,
            outcome: { champion, finalist },
        },
        { new: true }
    )

    return updatedTournament
}

module.exports = updateTournamentOutcome
