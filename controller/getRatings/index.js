const { rankPlayers } = require("../../service/playerRatings")
const {
    buildNameIndex,
    describeParameters,
    toRankingRow,
} = require("../../service/playerRatings/presentation")
const {
    retrieveAllUsers,
    retrieveRatingMatches,
    retrieveRatingsTimeline,
} = require("./../../service")

const createGetRatings = (dependencies = {}) => {
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveRatingMatches
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers

    return async (req, res) => {
        const [timeline, users] = await Promise.all([
            retrieveRatingsTimeline({ retrieveMatches }),
            retrieveUsers(),
        ])

        const names = buildNameIndex(users || [])
        const { config } = timeline
        const ranking = rankPlayers(timeline.snapshotAt(null))

        return res.json({
            success: true,
            parameters: describeParameters(config),
            data: ranking.map((player) => toRankingRow(player, names, config)),
        })
    }
}

const getRatings = createGetRatings()

module.exports = getRatings
module.exports.createGetRatings = createGetRatings
