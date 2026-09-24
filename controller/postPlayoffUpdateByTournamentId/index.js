const {
    generatePlayoffUpdate,
    retrieveTournamentById,
    retrievePlayoffMatchesByTournamentId,
} = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")
const withTransaction = require("../../utils/withTransaction")
const {
    getPlayoffStartSize,
    hasTabulatedPlayoffStartSize,
} = require("../../config/playoffFormats")

const validatePlayoffState = (matches, startSize) => {
    const ids = new Set()

    for (const match of matches) {
        const id = Number(match.playoff_id)
        if (!Number.isInteger(id) || id < 1 || id >= startSize || ids.has(id)) {
            throw new HttpError(
                422,
                "PLAYOFF_DATA_INVALID",
                "El bracket contiene IDs inválidos o duplicados"
            )
        }
        ids.add(id)

        if (
            match.played === true &&
            (!match.outcome?.playerThatWon || !match.outcome?.teamThatWon)
        ) {
            throw new HttpError(
                422,
                "PLAYOFF_DATA_INVALID",
                "El bracket contiene partidos jugados sin ganador válido"
            )
        }
    }
}

const createPostPlayoffUpdateByTournamentId = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrieveMatches =
        dependencies.retrievePlayoffMatchesByTournamentId ||
        retrievePlayoffMatchesByTournamentId
    const generateUpdate =
        dependencies.generatePlayoffUpdate || generatePlayoffUpdate
    const runInTransaction = dependencies.withTransaction || withTransaction

    return async (req, res) => {
        const { tournament } = req.params

        const result = await runInTransaction(async (session) => {
            const options = { session }
            const tournamentData = await retrieveTournament(tournament, options)

            if (!tournamentData) {
                throw new HttpError(
                    404,
                    "TOURNAMENT_NOT_FOUND",
                    "No se encontró el torneo"
                )
            }

            // Sólo los formatos tabulados admiten el update automático: el
            // fallback de 16 sirve para leer un bracket histórico, no para
            // generarle rondas nuevas.
            if (!hasTabulatedPlayoffStartSize(tournamentData.format)) {
                throw new HttpError(
                    422,
                    "PLAYOFF_UPDATE_UNSUPPORTED",
                    "El formato del torneo no admite actualización automática del playoff"
                )
            }

            const startSize = getPlayoffStartSize(tournamentData.format)

            const matches = await retrieveMatches(tournament, options)
            if (matches.length === 0) {
                throw new HttpError(
                    409,
                    "PLAYOFF_NOT_READY",
                    "El bracket del playoff aún no fue generado"
                )
            }

            validatePlayoffState(matches, startSize)

            const update = await generateUpdate(
                { id: tournamentData.id, name: tournamentData.name },
                matches,
                startSize,
                options
            )

            return [...update.created, ...update.updated]
        })

        return res.status(200).json({
            matches: result,
            message: result.length
                ? `Se han generado/actualizado partidos nuevos (${result.length})`
                : "No hay partidos nuevos para generar",
        })
    }
}

const postPlayoffUpdateByTournamentId = createPostPlayoffUpdateByTournamentId()

module.exports = postPlayoffUpdateByTournamentId
module.exports.createPostPlayoffUpdateByTournamentId =
    createPostPlayoffUpdateByTournamentId
module.exports.validatePlayoffState = validatePlayoffState
