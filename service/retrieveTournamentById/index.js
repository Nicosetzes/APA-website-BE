const { findTournamentById } = require("./../../dao")

const retrieveTournamentById = async (id, options = {}) => {
    return findTournamentById(id, options)
}

module.exports = retrieveTournamentById
