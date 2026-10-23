const tournamentRecapsModel = require("../../dao/models/tournamentRecaps")
const { HttpError } = require("../../middleware/httpErrors")
const { checkRecapCoherence } = require("../../config/tournamentRecap")
const {
    describeTournamentFormat,
} = require("../../config/tournamentFormatRules")
const { buildNameIndex } = require("../../service/playerRatings/presentation")
const { retrieveAllUsers, retrieveTournamentById } = require("./../../service")
const { existsMatchByTournamentId } = require("./../../dao")

const MONGO_DUPLICATE_KEY = 11000

// Upsert por torneo. `revision` no se manda en el `$set`: `$inc` crea el campo en
// 1 al insertar y suma 1 al reemplazar (un default en el schema chocaría con el
// `$inc` en la ruta de update).
const upsertRecapByTournament = (recap) =>
    tournamentRecapsModel.findOneAndUpdate(
        { tournamentId: recap.tournamentId },
        { $set: recap, $inc: { revision: 1 } },
        {
            upsert: true,
            new: true,
            rawResult: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    )

const hasPlayedValidMatches = (tournamentId) =>
    existsMatchByTournamentId(String(tournamentId), {
        played: true,
        valid: { $ne: false },
    })

const toPlain = (value) =>
    typeof value?.toObject === "function" ? value.toObject() : value

// Jugador del `outcome` con el nombre visible (apodo) y el guardado como
// alternativa aceptada: el texto puede usar cualquiera de los dos.
const toExpectedPlayer = (entry, names) => {
    if (!entry) return null
    const display = entry.id !== undefined ? names.get(String(entry.id)) : null

    return {
        name: display ?? entry.name,
        aliases: display && display !== entry.name ? [entry.name] : [],
    }
}

const toExpectedTeam = (entry) =>
    entry ? { name: entry.name, aliases: [] } : null

const createPostTournamentRecap = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const existsPlayedMatches =
        dependencies.existsPlayedMatches || hasPlayedValidMatches
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers
    const persistRecap = dependencies.persistRecap || upsertRecapByTournament

    return async (req, res) => {
        const { tournamentId, ...body } = req.body
        const found = await retrieveTournament(tournamentId)

        if (!found) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo indicado"
            )
        }

        const tournament = toPlain(found)
        const champion = tournament.outcome?.champion
        const runnerUp = tournament.outcome?.finalist

        if (tournament.ongoing !== false || !champion) {
            throw new HttpError(
                409,
                "TOURNAMENT_NOT_FINISHED",
                "El torneo todavía no terminó"
            )
        }

        if (!(await existsPlayedMatches(tournamentId))) {
            throw new HttpError(
                422,
                "TOURNAMENT_WITHOUT_MATCHES",
                "El torneo no tiene partidos jugados: no se puede guardar un recap"
            )
        }

        const names = buildNameIndex(await retrieveUsers())
        const coherence = checkRecapCoherence({
            recap: body.recap,
            rules: describeTournamentFormat(tournament),
            result: {
                champion: {
                    player: toExpectedPlayer(champion.player, names),
                    team: toExpectedTeam(champion.team),
                },
                runnerUp: {
                    player: toExpectedPlayer(runnerUp?.player, names),
                    team: toExpectedTeam(runnerUp?.team),
                },
            },
        })

        if (!coherence.ok) {
            throw new HttpError(
                422,
                "TOURNAMENT_RECAP_CONTENT_INVALID",
                "El recap no cumple el contrato de contenido",
                [
                    ...coherence.missingSections.map((section) => ({
                        source: "body",
                        path: "recap",
                        code: "missing_section",
                        message: `Falta la sección "## ${section}"`,
                    })),
                    ...coherence.missingNames.map((name) => ({
                        source: "body",
                        path: "recap",
                        code: "missing_name",
                        message: `El texto no menciona al ${name}`,
                    })),
                ]
            )
        }

        // `tournament`, `format` y `closedAt` salen del torneo: n8n no puede
        // mandar valores inconsistentes.
        const document = {
            ...body,
            tournamentId: String(tournamentId),
            tournament: tournament.name,
            format: tournament.format,
            ...(tournament.closedAt && { closedAt: tournament.closedAt }),
        }

        let result
        try {
            result = await persistRecap(document)
        } catch (error) {
            // Dos corridas simultáneas sobre el mismo torneo: la segunda inserta
            // a la vez que la primera y choca con el índice único. Se reintenta
            // una vez, ahora como reemplazo.
            if (error?.code !== MONGO_DUPLICATE_KEY) throw error
            result = await persistRecap(document)
        }

        const replaced = Boolean(result.lastErrorObject?.updatedExisting)

        return res.status(replaced ? 200 : 201).json({
            success: true,
            replaced,
            data: result.value,
        })
    }
}

const postTournamentRecap = createPostTournamentRecap()

module.exports = postTournamentRecap
module.exports.createPostTournamentRecap = createPostTournamentRecap
