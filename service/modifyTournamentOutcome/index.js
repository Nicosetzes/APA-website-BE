const { updateTournamentOutcome } = require("./../../dao")

const modifyTournamentOutcome = async (
    tournament,
    champion,
    finalist,
    options = {},
    closure = {}
) => {
    return updateTournamentOutcome(
        tournament,
        champion,
        finalist,
        options,
        closure
    )
}

module.exports = modifyTournamentOutcome
