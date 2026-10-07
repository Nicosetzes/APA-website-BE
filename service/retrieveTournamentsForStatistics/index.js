const { findTournamentsForStatistics } = require("./../../dao")

const retrieveTournamentsForStatistics = async () => {
    return await findTournamentsForStatistics()
}

module.exports = retrieveTournamentsForStatistics
