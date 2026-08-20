const { findTournaments } = require("./../../dao")

const retrieveTournaments = async (legacy, status) => {
    return await findTournaments(legacy, status)
}

module.exports = retrieveTournaments
