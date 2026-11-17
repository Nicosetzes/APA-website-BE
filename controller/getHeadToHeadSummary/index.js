const retrieveHeadToHeadSummary = require("./../../service/retrieveHeadToHeadSummary")

const createGetHeadToHeadSummary = (dependencies = {}) => {
    const retrieve =
        dependencies.retrieveHeadToHeadSummary || retrieveHeadToHeadSummary

    return async (req, res) => {
        const summary = await retrieve()
        return res.status(200).json(summary)
    }
}

const getHeadToHeadSummary = createGetHeadToHeadSummary()

module.exports = getHeadToHeadSummary
module.exports.createGetHeadToHeadSummary = createGetHeadToHeadSummary
