const { findMatches } = require("./../../dao")

const retrieveMatches = async (qty) => {
    return await findMatches(qty)
}

module.exports = retrieveMatches
