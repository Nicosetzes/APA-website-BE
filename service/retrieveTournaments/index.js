const { findTournaments } = require("./../../dao")

const retrieveTournaments = async (status) => {
    return await findTournaments(status)
}

module.exports = retrieveTournaments
