const { updateTournamentOutcome } = require("./../../dao")

const modifyTournamentOutcome = async (tournament, champion, finalist) => {
    return await updateTournamentOutcome(tournament, champion, finalist)
}

module.exports = modifyTournamentOutcome
