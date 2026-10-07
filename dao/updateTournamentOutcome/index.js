const tournamentsModel = require("./../models/tournaments.js")

// `closure` trae la fecha de cierre (D3); sin ella se cierra con `now`.
const updateTournamentOutcome = async (
    tournament,
    champion,
    finalist,
    options = {},
    closure = {}
) => {
    return tournamentsModel.findByIdAndUpdate(
        tournament,
        {
            ongoing: false,
            outcome: { champion, finalist },
            closedAt: closure.closedAt ?? new Date(),
            closedAtPrecision: closure.closedAtPrecision ?? "exact",
        },
        { ...options, new: true }
    )
}

module.exports = updateTournamentOutcome
