const { updateTournamentOutcome } = require("./../../dao")

const modifyTournamentOutcome = async (
    tournament,
    champion,
    finalist,
    options = {}
) => {
    return updateTournamentOutcome(tournament, champion, finalist, options)
}

module.exports = modifyTournamentOutcome
