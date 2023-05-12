const { modifyMatchResultToRemoveIt } = require("./../../service")

const putRemoveMatchByTournamentId = async (req, res) => {
    // const tournamentId = req.params.id
    const matchId = req.params.match

    try {
        const deletedResult = await modifyMatchResultToRemoveIt(matchId) // I make an update on the result in "face-to-face" collection

        deletedResult
            ? res.status(200).json(deletedResult)
            : res.status(500).json({
                  message: `El partido de ID ${matchId} no se encuentra en la base de datos`,
              })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = putRemoveMatchByTournamentId
