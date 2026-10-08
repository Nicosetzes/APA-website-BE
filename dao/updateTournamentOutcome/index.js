const tournamentsModel = require("./../models/tournaments.js")

// `closure` trae la fecha del partido que cierra el torneo; sin ella, `now`.
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
