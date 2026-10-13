// Fuerza de equipo para el APA Rating 2.0: el "overall" de Sofifa que tenía cada
// equipo en la edición del juego con que se jugó el torneo del partido.
//
// Los datos salen de `data/teamRatings.json`, un artefacto generado desde los CSV
// de `data/` con `npm run build:team-ratings`. Se carga con un `require` plano
// (sin `fs` ni variables de entorno) para que sea el mismo código en dev, CI y
// Vercel: el empaquetado de Vercel sigue los `require` literales.

const data = require("../../data/teamRatings.json")

// Los ids pueden venir como número (equipos) o string (torneos, ObjectId):
// se comparan siempre como string. `null`/`undefined` nunca se vuelven "undefined".
const toKey = (value) =>
    value === undefined || value === null ? null : String(value)

const toMap = (source, name) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new Error(`teamRatings: "${name}" tiene que ser un objeto`)
    }
    return new Map(Object.entries(source))
}

const editionOf = (editions, match) => {
    const tournamentId = toKey(match?.tournament?.id)
    return tournamentId === null ? null : editions.get(tournamentId) ?? null
}

const overallOf = (overalls, teamId, edition) => {
    const id = toKey(teamId)
    if (id === null || edition === null) return null
    const overall = overalls.get(`${id}|${edition}`)
    return typeof overall === "number" && Number.isFinite(overall)
        ? overall
        : null
}

// Devuelve `(match) => { t1, t2 } | null`. Solo hay resultado si se conoce la
// edición del torneo y el overall de los dos equipos; si falta cualquier dato el
// partido se calcula como en la 1.0 (sin término de equipo).
const createTeamStrengthLookup = ({
    editionByTournament,
    overallByTeamEdition,
} = {}) => {
    const editions = toMap(editionByTournament, "editionByTournament")
    const overalls = toMap(overallByTeamEdition, "overallByTeamEdition")

    return (match) => {
        const edition = editionOf(editions, match)
        const t1 = overallOf(overalls, match?.teamP1?.id, edition)
        const t2 = overallOf(overalls, match?.teamP2?.id, edition)
        return t1 === null || t2 === null ? null : { t1, t2 }
    }
}

const defaultTeamStrength = createTeamStrengthLookup(data)

// Cobertura de una lista de partidos: cuántos tienen overall de ambos equipos y
// qué falta cargar (torneos sin edición y pares equipo|edición sin rating).
const summarizeCoverage = (matches, source = data) => {
    const editions = toMap(source.editionByTournament, "editionByTournament")
    const overalls = toMap(source.overallByTeamEdition, "overallByTeamEdition")

    const tournaments = new Map()
    const pairs = new Map()
    let total = 0
    let covered = 0

    for (const match of matches) {
        total += 1
        const tournamentId = toKey(match?.tournament?.id)
        const edition = editionOf(editions, match)

        if (tournamentId !== null && edition === null) {
            const entry = tournaments.get(tournamentId) ?? {
                tournamentId,
                name: match.tournament.name ?? null,
                matches: 0,
            }
            entry.matches += 1
            tournaments.set(tournamentId, entry)
        }

        let complete = edition !== null
        for (const team of [match?.teamP1, match?.teamP2]) {
            if (edition === null) break
            const teamId = toKey(team?.id)
            if (teamId === null) {
                complete = false
                continue
            }
            if (overallOf(overalls, teamId, edition) === null) {
                complete = false
                const key = `${teamId}|${edition}`
                const entry = pairs.get(key) ?? {
                    teamId,
                    teamName: team.name ?? null,
                    edition,
                    matches: 0,
                }
                entry.matches += 1
                pairs.set(key, entry)
            }
        }
        if (complete) covered += 1
    }

    return {
        total,
        covered,
        tournamentsWithoutEdition: [...tournaments.values()],
        missingPairs: [...pairs.values()],
    }
}

module.exports = {
    createTeamStrengthLookup,
    defaultTeamStrength,
    summarizeCoverage,
}
