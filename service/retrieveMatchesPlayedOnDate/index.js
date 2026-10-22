const { findMatchesPlayedOnDate } = require("./../../dao")

const retrieveMatchesPlayedOnDate = async (date) => {
    return findMatchesPlayedOnDate(date)
}

module.exports = retrieveMatchesPlayedOnDate
