const { findMatchTeams } = require("./../../dao")

const retrieveMatchTeams = async () => {
    return await findMatchTeams()
}

module.exports = retrieveMatchTeams
