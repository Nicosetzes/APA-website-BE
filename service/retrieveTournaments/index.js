const { findTournaments } = require("./../../dao")

const retrieveTournaments = async () => {
    return await findTournaments()
}

module.exports = retrieveTournaments
