const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")

const usersModel = require("../../dao/models/users")
const tournamentsModel = require("../../dao/models/tournaments")
const matchesModel = require("../../dao/models/matches")
const editsModel = require("../../dao/models/edits")

const invalidSession = (res, message) =>
    res.status(403).json({
        auth: false,
        code: "INVALID_SESSION",
        message,
    })

const forbidden = (res, message) =>
    res.status(403).json({
        auth: true,
        code: "FORBIDDEN",
        message,
    })

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
        return invalidSession(res, "No existe sesión activa")
    }

    const token = authHeader.substring(7)
    let tokenData

    try {
        tokenData = jwt.verify(token, process.env.TOKEN_SECRET)
    } catch (error) {
        return invalidSession(
            res,
            "Sesión no válida, error en las credenciales"
        )
    }

    if (!mongoose.isValidObjectId(tokenData.id)) {
        return invalidSession(
            res,
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
                "La sesión no corresponde a un usuario válido"
            )
        }

        req.user = {
            id: normalizeId(user._id),
            name: user.nickname,
            role: user.role || "user",
        }

        return next()
    } catch (error) {
        console.error("Authentication user lookup failed:", error)
        return res.status(500).json({
            auth: false,
            code: "AUTHENTICATION_ERROR",
            message: "No se pudo validar la sesión",
        })
    }
}

const requireTournamentAccess = (
    getTournamentId = (req) => req.params.tournament
) => {
    return async (req, res, next) => {
        const tournamentId = getTournamentId(req)

        if (!mongoose.isValidObjectId(tournamentId)) {
            return res.status(400).json({
                auth: true,
                code: "INVALID_TOURNAMENT_ID",
                message: "El torneo indicado no es válido",
            })
        }

        try {
            const tournament = await tournamentsModel
                .findById(tournamentId)
                .select("players teams")
                .lean()

            if (!tournament) {
                return res.status(404).json({
                    auth: true,
                    code: "TOURNAMENT_NOT_FOUND",
                    message: "No se encontró el torneo",
                })
            }

            req.tournament = tournament

            if (req.user.role === "superadmin") return next()

            const participantIds = getParticipantIds(tournament)
            if (!participantIds.has(normalizeId(req.user.id))) {
                return forbidden(
                    res,
                    "No tenés permisos para modificar este torneo"
                )
            }

            return next()
        } catch (error) {
            console.error("Tournament authorization failed:", error)
            return res.status(500).json({
                auth: true,
                code: "AUTHORIZATION_ERROR",
                message: "No se pudo validar el acceso al torneo",
            })
        }
    }
}

const requireMatchInTournament = async (req, res, next) => {
    const { match: matchId, tournament: tournamentId } = req.params

    if (!mongoose.isValidObjectId(matchId)) {
        return res.status(400).json({
            auth: true,
            code: "INVALID_MATCH_ID",
            message: "El partido indicado no es válido",
        })
    }

    try {
        const match = await matchesModel
            .findById(matchId)
            .select("tournament")
            .lean()

        if (
            !match ||
            normalizeId(match.tournament?.id) !== normalizeId(tournamentId)
        ) {
            return res.status(404).json({
                auth: true,
                code: "MATCH_NOT_FOUND",
                message: "No se encontró el partido en el torneo indicado",
            })
        }

        req.match = match
        return next()
    } catch (error) {
        console.error("Match authorization failed:", error)
        return res.status(500).json({
            auth: true,
            code: "AUTHORIZATION_ERROR",
            message: "No se pudo validar el acceso al partido",
        })
    }
}

const requireEditOwnership = async (req, res, next) => {
    const { id } = req.params

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
            auth: true,
            code: "INVALID_EDIT_ID",
            message: "La edición indicada no es válida",
        })
    }

    try {
        const edit = await editsModel.findById(id)

        if (!edit) {
            return res.status(404).json({
                auth: true,
                code: "EDIT_NOT_FOUND",
                message: "No se encontró la edición",
            })
        }

        if (
            req.user.role !== "superadmin" &&
            normalizeId(edit.user) !== normalizeId(req.user.id)
        ) {
            return forbidden(res, "No tenés permisos para borrar esta edición")
        }

        req.edit = edit
        return next()
    } catch (error) {
        console.error("Edit authorization failed:", error)
        return res.status(500).json({
            auth: true,
            code: "AUTHORIZATION_ERROR",
            message: "No se pudo validar el acceso a la edición",
        })
    }
}

module.exports = {
    isAuth,
    requireTournamentAccess,
    requireMatchInTournament,
    requireEditOwnership,
}
