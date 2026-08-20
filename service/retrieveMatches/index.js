const { findMatches } = require("./../../dao")

const retrieveMatches = async (filters) => {
    return await findMatches(filters)
}

module.exports = retrieveMatches
