const { findMatchesByTeamName } = require("./../../dao")

const retrieveMatchesByTeamName = async (teamName, page) => {
    return await findMatchesByTeamName(teamName, page)
}

module.exports = retrieveMatchesByTeamName
