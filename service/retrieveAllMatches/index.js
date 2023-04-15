const { findAllMatches } = require("./../../dao")

const retrieveAllMatches = async () => {
    return await findAllMatches()
}

module.exports = retrieveAllMatches
