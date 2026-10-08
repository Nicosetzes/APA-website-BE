const matchesModel = require("./../models/matches.js")
const { comparePlayedAtDesc } = require("../../utils/playedAt")

const PROJECTION =
    "playerP1 teamP1 scoreP1 playerP2 teamP2 scoreP2 outcome tournament type playoff_id playedAt playedAtPrecision"

// `includeAllPlayoffs` suma, en la misma query, los partidos de playoff sin
// jugar o `valid: false` que necesitan las rachas por torneo. El caller tiene
// que separarlos: sin la opción, el resultado es el de siempre.
const findAllMatches = async ({ includeAllPlayoffs = false } = {}) => {
    const playedAndValid = {
        played: { $ne: false },
        valid: { $ne: false },
    }
    const filter = includeAllPlayoffs
        ? { $or: [playedAndValid, { type: "playoff" }] }
        : playedAndValid
    const projection = includeAllPlayoffs
        ? `${PROJECTION} played valid`
        : PROJECTION

    const matches = await matchesModel.find(filter, projection)

    // Orden `playedAt` desc en JS (desempate `_id` desc).
    return Array.from(matches).sort(comparePlayedAtDesc)
}

module.exports = findAllMatches
