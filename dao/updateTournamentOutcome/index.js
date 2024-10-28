const tournamentsModel = require("./../models/tournaments.js")

const updateTournamentOutcome = async (tournament, champion, finalist) => {
    const updatedTournament = await tournamentsModel.findByIdAndUpdate(
        tournament,
        {
            ongoing: false,
            outcome: { champion, finalist },
        },
        { new: true } // Returns the updated document, not the original
    )

    return updatedTournament
}

module.exports = updateTournamentOutcome
