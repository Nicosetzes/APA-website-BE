const matchesModel = require("./../models/matches.js")

const findMatchesByTournamentIds = async (ids) => {
    let matches = []
    // console.log(ids)
    if (ids.length == 1)
        matches = await matchesModel.find({
            "tournament.id": ids[0],
            // type: "regular", // Activar a futuro //
        })

    if (ids.length > 1) {
        // console.log("más de un ID")
        const query = ids.map((id, index) => {
            return {
                "tournament.id": id,
            }
        })
        matches = matchesModel.find({
            $or: query,
        })
    }
    return matches
}

module.exports = findMatchesByTournamentIds
