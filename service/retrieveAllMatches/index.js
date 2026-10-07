const { findAllMatches } = require("./../../dao")

const retrieveAllMatches = async (options) => {
    return await findAllMatches(options)
}

module.exports = retrieveAllMatches
