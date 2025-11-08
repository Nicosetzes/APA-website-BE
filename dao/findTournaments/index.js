const tournamentsModel = require("./../models/tournaments.js")

const findTournaments = async (status) => {
    let tournaments

    if (status === "finalized") {
        tournaments = await tournamentsModel
            .find(
                { ongoing: false, valid: { $ne: false } },
                "name cloudinary_id outcome"
            )
            .sort({ createdAt: 1, id: -1 })
    } else if (status === "active") {
        tournaments = await tournamentsModel
            .find(
                { ongoing: true, valid: { $ne: false } },
                "name ongoing cloudinary_id"
            )
            .sort({ createdAt: -1, id: -1 })
    } else {
        tournaments = await tournamentsModel
            .find(
                { valid: { $ne: false } },
                "name ongoing cloudinary_id outcome"
            )
            .sort({ createdAt: -1, id: -1 })
    }

    return tournaments
}

module.exports = findTournaments
