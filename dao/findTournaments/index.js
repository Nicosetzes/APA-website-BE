const tournamentsModel = require("./../models/tournaments.js")

const findTournaments = async () => {
    const tournaments = await tournamentsModel.find(
        {},
        "name ongoing cloudinary_id"
    )
    return tournaments
}

module.exports = findTournaments
