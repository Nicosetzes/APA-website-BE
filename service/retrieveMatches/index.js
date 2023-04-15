const { findMatches } = require("./../../dao")

const retrieveMatches = async (page, teamName) => {
    return await findMatches(page, teamName)
}

module.exports = retrieveMatches
