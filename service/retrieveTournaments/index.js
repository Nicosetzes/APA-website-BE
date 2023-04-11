const { findTournaments } = require("./../../dao")

const retrieveTournaments = async (prop) => {
    return await findTournaments(prop)
}

module.exports = retrieveTournaments
