const { findTournaments } = require("./../../dao")

const retrieveTournaments = async (finalized) => {
    return await findTournaments(finalized)
}

module.exports = retrieveTournaments
