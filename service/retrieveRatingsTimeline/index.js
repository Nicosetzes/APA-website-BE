const { buildRatingsTimeline } = require("../playerRatings/timeline")
const retrieveRatingMatches = require("../retrieveRatingMatches")

const retrieveRatingsTimeline = async ({
    retrieveMatches = retrieveRatingMatches,
    options,
} = {}) => buildRatingsTimeline(await retrieveMatches(), options)

module.exports = retrieveRatingsTimeline
