const tournamentsModel = require("./../models/tournaments.js")

const findTournaments = async (finalized) => {
    let tournaments = finalized
        ? await tournamentsModel
              .find(
                  { outcome: { $exists: true }, valid: { $ne: false } },
                  "name cloudinary_id outcome"
              )
              .sort({ createdAt: 1, id: -1 })
        : await tournamentsModel
              .find(
                  { valid: { $ne: false } },
                  "name ongoing cloudinary_id outcome"
              )
              .sort({ createdAt: 1, id: -1 })
    return tournaments
}

module.exports = findTournaments
