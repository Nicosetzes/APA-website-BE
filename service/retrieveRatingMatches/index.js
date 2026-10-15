const { findRatingMatches } = require("./../../dao")

const retrieveRatingMatches = async () => {
    return await findRatingMatches()
}

module.exports = retrieveRatingMatches
