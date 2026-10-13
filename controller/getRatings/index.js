const {
    buildNameIndex,
    describeParameters,
    toRankingRow,
} = require("../../service/playerRatings/presentation")
const {
    calculatePlayerRatings,
    rankPlayers,
    snapshotBefore,
} = require("../../service/playerRatings")
const { retrieveAllMatches, retrieveAllUsers } = require("./../../service")

const createGetRatings = (dependencies = {}) => {
    const retrieveMatches =
        dependencies.retrieveAllMatches || retrieveAllMatches
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers

    return async (req, res) => {
        const [matches, users] = await Promise.all([
            retrieveMatches(),
            retrieveUsers(),
        ])

        const names = buildNameIndex(users || [])
        const { events, config } = calculatePlayerRatings(matches || [])
        const ranking = rankPlayers(
            snapshotBefore(events, null, config.initialRating)
        )

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
