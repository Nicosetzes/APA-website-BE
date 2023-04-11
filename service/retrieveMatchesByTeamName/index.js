const { findMatchesByTeamName } = require("./../../dao")

const retrieveMatchesByTeamName = async (query) => {
    return await findMatchesByTeamName(query)
}

module.exports = retrieveMatchesByTeamName
