const matchesModel = require("./../models/matches.js")

const countAllNotPlayedMatchesByTournamentId = async (tournament, players) => {
    let matches
    if (!players) {
        // If players weren's specified, I retrieve all remaining matches for the tournament //
        matches = await matchesModel.countDocuments({
            "tournament.id": tournament,
            played: false,
        })

        return matches
    } else if (players.length == 1) {
        // If one player was specified, I count the total amount of remaining matches for that player //
        const id = players.at(0)
        matches = await matchesModel.countDocuments({
            "tournament.id": tournament,
            played: false,
            $or: [{ "playerP1.id": id }, { "playerP2.id": id }],
        })
        return matches
    } else if (players.length == 2) {
        // If two players were specified, I count the total amount of remaining matches between them //
        matches = await matchesModel.countDocuments({
            "tournament.id": tournament,
            played: false,
            $or: [
                {
                    $and: [
                        { "playerP1.id": players.at(0) },
                        { "playerP2.id": players.at(1) },
                    ],
                },
                {
                    $and: [
                        { "playerP1.id": players.at(1) },
                        { "playerP2.id": players.at(0) },
                    ],
                },
            ],
        })

        return matches
    } else {
        // In this case, I return the amount of remaining matches for each player in a tournament //
        /* 
        1) I map all player IDs. 
        2) In each loop, I calculate the required value for each player and return this value
        3) Since each value is a promise (pending), at the end of the .map I must return all results with Promise.all()
        4) To use this values later, I'll need to resolve this funcion with await.  
        */
        matches = players.map(async (player) => {
            let value = await matchesModel.countDocuments({
                "tournament.id": tournament,
                played: false,
                $or: [{ "playerP1.id": player }, { "playerP2.id": player }],
            })
            return value
        })
        return Promise.all(matches)
    }
}

module.exports = countAllNotPlayedMatchesByTournamentId
