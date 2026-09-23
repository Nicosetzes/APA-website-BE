const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")

const usersModel = require("../../dao/models/users")
const tournamentsModel = require("../../dao/models/tournaments")
const matchesModel = require("../../dao/models/matches")
const editsModel = require("../../dao/models/edits")
const { HttpError } = require("../../middleware/httpErrors")

const invalidSession = (res, next, message) => {
    res.set("WWW-Authenticate", "Bearer")
    return next(new HttpError(401, "INVALID_SESSION", message))
}

const forbidden = (next, message) =>
    next(new HttpError(403, "FORBIDDEN", message))

const normalizeId = (value) => {
    if (value === null || value === undefined) return null
    return String(value)
}

const getParticipantIds = (tournament) => {
    const playerIds = (tournament.players || []).map(
        (player) => player?.id ?? player?._id ?? player
    )
    const assignedPlayerIds = (tournament.teams || []).map(
        ({ player }) => player?.id ?? player?._id ?? player
    )

    return new Set(
        [...playerIds, ...assignedPlayerIds]
            .map(normalizeId)
            .filter((id) => id !== null)
    )
}

const isAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return invalidSession(res, next, "No existe sesión activa")
    }

    const token = authHeader.substring(7)
    let tokenData

    try {
        tokenData = jwt.verify(token, process.env.TOKEN_SECRET)
    } catch (error) {
        return invalidSession(
            res,
            next,
            "Sesión no válida, error en las credenciales"
        )
    }

    if (!mongoose.isValidObjectId(tokenData.id)) {
        return invalidSession(
            res,
            next,
            "La sesión no corresponde a un usuario válido"
        )
    }

    try {
        const user = await usersModel
            .findById(tokenData.id)
            .select("_id nickname role")
            .lean()

        if (!user) {
            return invalidSession(
                res,
                next,
                "La sesión no corresponde a un usuario válido"
            )
        }

        req.user = {
            id: normalizeId(user._id),
            name: user.nickname,
            role: user.role || "user",
        }

        return next()
    } catch (cause) {
        return next(
            new HttpError(
                500,
                "AUTHENTICATION_ERROR",
                "No se pudo validar la sesión",
                [],
                { cause }
            )
        )
    }
}

const requireTournamentAccess = (
    getTournamentId = (req) => req.params.tournament
) => {
    return async (req, res, next) => {
        const tournamentId = getTournamentId(req)

        if (!mongoose.isValidObjectId(tournamentId)) {
            return next(
                new HttpError(
                    400,
                    "INVALID_TOURNAMENT_ID",
                    "El torneo indicado no es válido"
                )
            )
        }

        try {
            const tournament = await tournamentsModel
                .findById(tournamentId)
                .select("players teams")
                .lean()

            if (!tournament) {
                return next(
                    new HttpError(
                        404,
                        "TOURNAMENT_NOT_FOUND",
                        "No se encontró el torneo"
                    )
                )
            }

            req.tournament = tournament

            if (req.user.role === "superadmin") return next()

            const participantIds = getParticipantIds(tournament)
            if (!participantIds.has(normalizeId(req.user.id))) {
                return forbidden(
                    next,
                    "No tenés permisos para modificar este torneo"
                )
            }

            return next()
        } catch (cause) {
            return next(
                new HttpError(
                    500,
                    "AUTHORIZATION_ERROR",
                    "No se pudo validar el acceso al torneo",
                    [],
                    { cause }
                )
            )
        }
    }
}

const requireMatchInTournament = async (req, res, next) => {
    const { match: matchId, tournament: tournamentId } = req.params

    if (!mongoose.isValidObjectId(matchId)) {
        return next(
            new HttpError(
                400,
                "INVALID_MATCH_ID",
                "El partido indicado no es válido"
            )
        )
    }

    try {
        const match = await matchesModel
            .findById(matchId)
            .select("tournament type seedP1 seedP2")
            .lean()

        if (
            !match ||
            normalizeId(match.tournament?.id) !== normalizeId(tournamentId)
        ) {
            return next(
                new HttpError(
                    404,
                    "MATCH_NOT_FOUND",
                    "No se encontró el partido en el torneo indicado"
                )
            )
        }

        req.match = match
        return next()
    } catch (cause) {
        return next(
            new HttpError(
                500,
                "AUTHORIZATION_ERROR",
                "No se pudo validar el acceso al partido",
                [],
                { cause }
            )
        )
    }
}

const requireEditOwnership = async (req, res, next) => {
    const { id } = req.params

    if (!mongoose.isValidObjectId(id)) {
        return next(
            new HttpError(
                400,
                "INVALID_EDIT_ID",
                "La edición indicada no es válida"
            )
        )
    }

    try {
        const edit = await editsModel.findById(id)

        if (!edit) {
            return next(
                new HttpError(
                    404,
                    "EDIT_NOT_FOUND",
                    "No se encontró la edición"
                )
            )
        }

        if (
            req.user.role !== "superadmin" &&
            normalizeId(edit.user) !== normalizeId(req.user.id)
        ) {
            return forbidden(next, "No tenés permisos para borrar esta edición")
        }

        req.edit = edit
        return next()
    } catch (cause) {
        return next(
            new HttpError(
                500,
                "AUTHORIZATION_ERROR",
                "No se pudo validar el acceso a la edición",
                [],
                { cause }
            )
        )
    }
}

module.exports = {
    isAuth,
    requireTournamentAccess,
    requireMatchInTournament,
    requireEditOwnership,
}
