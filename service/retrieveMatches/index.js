const { findMatches } = require("./../../dao")

const retrieveMatches = async (page, teamName, date, played) => {
    return await findMatches(page, teamName, date, played)
}

module.exports = retrieveMatches
