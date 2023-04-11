const { findTournamentById } = require("./../../dao")

const retrieveTournamentById = async (id) => {
    return await findTournamentById(id)
}

module.exports = retrieveTournamentById
