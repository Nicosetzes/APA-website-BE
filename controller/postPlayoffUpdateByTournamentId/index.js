const {
    generatePlayoffUpdate,
    retrieveTournamentById,
    retrievePlayoffMatchesByTournamentId,
} = require("./../../service")

// champions_league uses home+away brackets and is not handled here yet
const FORMAT_TO_START_SIZE = {
    playoff: 32,
    world_cup_2026: 32,
    world_cup: 16,
    league_playin_playoff: 16,
}

const postPlayoffUpdateByTournamentId = async (req, res) => {
    const { tournament } = req.params

    try {
        const { id, name, format } = await retrieveTournamentById(tournament)

        if (format === "champions_league") {
            return res.status(501).json({
                message:
                    "La actualización automática de playoffs para el formato champions_league aún no está implementada.",
            })
        }

        const startSize = FORMAT_TO_START_SIZE[format] ?? 16
        const matches = await retrievePlayoffMatchesByTournamentId(tournament)

        const { created, updated } = await generatePlayoffUpdate(
            { id, name },
            matches,
            startSize
        )

        const allNew = [...created, ...updated]

        return allNew.length
            ? res.status(200).json({
                  matches: allNew,
                  message: `Se han generado/actualizado partidos nuevos (${allNew.length})`,
              })
            : res.status(200).json({
                  matches: allNew,
                  message: `No hay partidos nuevos para generar`,
              })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = postPlayoffUpdateByTournamentId
