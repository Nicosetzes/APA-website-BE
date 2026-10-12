const { findTournamentIdsPlayedOnDate } = require("./../../dao")

const retrieveTournamentIdsPlayedOnDate = async (date) => {
    return findTournamentIdsPlayedOnDate(date)
}

module.exports = retrieveTournamentIdsPlayedOnDate
