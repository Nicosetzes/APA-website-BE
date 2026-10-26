const { buildStandingsViewPath } = require("../../config/assistant")
const { findTournamentById } = require("./../../dao")
const { HttpError } = require("../../middleware/httpErrors")
const { omitNil } = require("../../utils/omitNil")

// Formatos sin tabla de posiciones: la eliminatoria pura no tiene fase regular
// y los históricos no tienen reglas definidas.
const FORMATS_WITHOUT_TABLE = ["playoff", "american_cup", "club_world_cup"]

const toForm = (streak) => {
    const form = (streak || [])
        .map(({ outcome }) => String(outcome ?? "").toUpperCase())
        .join("")

    return form || null
}

// Un solo texto que el agente pueda decir tal cual. Los indicadores solo
// existen en la Liga (`eliminated`) y en la Superliga (los tres) y son los que
// calcula el endpoint de la tabla: ya consideran los puntos que quedan en juego.
const describeQualification = (format, row) => {
    if (format === "league") {
        return row.eliminated === true
            ? "ya no puede alcanzar al líder aunque gane todos los partidos que le quedan"
            : null
    }

    if (format === "league_playin_playoff") {
        if (row.directlyQualified === true)
            return "clasificado directo al playoff"
        if (row.playinQualified === true)
            return "tiene asegurado al menos el play-in"
        if (row.eliminated === true) return "eliminado: no llega al play-in"
    }

    return null
}

const toRow = (row, position, format) =>
    omitNil({
        position,
        player: row.player?.name ?? null,
        team: row.team?.name ?? null,
        played: row.played ?? 0,
        wins: row.wins ?? 0,
        draws: row.draws ?? 0,
        losses: row.losses ?? 0,
        goalsFor: row.goalsFor ?? 0,
        goalsAgainst: row.goalsAgainst ?? 0,
        goalDifference: row.scoringDifference ?? 0,
        points: row.points ?? 0,
        form: toForm(row.streak),
        qualification: describeQualification(format, row),
    })

// Tabla de posiciones compacta para el agente. Reutiliza el cálculo del
// endpoint de la tabla (`retrieveStandings`) y le saca lo que pesa: las últimas
// jornadas completas de cada equipo, que multiplican varias veces el tamaño.
const retrieveAssistantStandings = async (filters, dependencies = {}) => {
    const { tournamentId, group, playerId } = filters
    const findTournament = dependencies.findTournamentById || findTournamentById
    const retrieveStandings = dependencies.retrieveStandings
    const now = dependencies.now?.() ?? new Date()

    const tournament = await findTournament(tournamentId)

    if (!tournament) {
        throw new HttpError(
            404,
            "TOURNAMENT_NOT_FOUND",
            "No se encontró el torneo indicado"
        )
    }

    const summary = {
        id: String(tournament.id ?? tournament._id),
        name: tournament.name,
        format: tournament.format ?? null,
        ongoing: tournament.ongoing !== false,
    }
    const base = {
        asOf: now.toISOString(),
        tournament: summary,
        filters: { group: group ?? null, playerId: playerId ?? null },
    }

    if (FORMATS_WITHOUT_TABLE.includes(tournament.format)) {
        return {
            ...base,
            hasTable: false,
            standings: [],
            viewPath: null,
            notes: [
                "Este torneo no tiene tabla de posiciones: es de eliminación directa o un formato histórico.",
            ],
        }
    }

    const payload = await retrieveStandings({ tournamentId, group })
    const groups = payload?.standings || []
    const notes = []

    // Se numera antes de filtrar por jugador: la posición es la real dentro del
    // grupo.
    const standings = groups
        .map((entry) => ({
            group: entry.group ?? null,
            teams: (entry.teams || [])
                .map((row, index) => ({ row, position: index + 1 }))
                .filter(
                    ({ row }) =>
                        !playerId || String(row.player?.id) === String(playerId)
                )
                .map(({ row, position }) =>
                    toRow(row, position, tournament.format)
                ),
        }))
        .filter((entry) => !playerId || entry.teams.length > 0)

    if (playerId && standings.length === 0)
        notes.push(
            "Ese jugador no tiene equipos en este torneo (o en ese grupo)."
        )

    if (group && groups.every((entry) => !entry.teams?.length))
        notes.push(`El grupo ${group} no tiene equipos.`)

    if (
        standings.length > 0 &&
        standings.every(({ teams }) => teams.every((row) => row.played === 0))
    )
        notes.push("Todavía no se jugó ningún partido de la fase regular.")

    return {
        ...base,
        hasTable: true,
        standings,
        viewPath: buildStandingsViewPath(summary.id),
        notes,
    }
}

module.exports = retrieveAssistantStandings
module.exports.describeQualification = describeQualification
module.exports.FORMATS_WITHOUT_TABLE = FORMATS_WITHOUT_TABLE
