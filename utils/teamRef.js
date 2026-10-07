// `team.id` se guarda como number (D5). Mientras convivan ids string y number
// en la base, las comparaciones pasan por String.

const NUMERIC_ID = /^\d+$/

const toTeamId = (value) => {
    if (Number.isInteger(value)) return value
    if (typeof value === "string" && NUMERIC_ID.test(value))
        return Number(value)
    return value
}

const normalizeTeamRef = (team) =>
    team && typeof team === "object" ? { ...team, id: toTeamId(team.id) } : team

const sameTeamId = (a, b) =>
    a !== null &&
    a !== undefined &&
    b !== null &&
    b !== undefined &&
    String(a) === String(b)

// `tournament.teams` ([{ team, player, group }]) con `team.id` normalizado,
// para que los partidos generados copien ids number.
const normalizeTeamEntries = (teams) =>
    Array.isArray(teams)
        ? teams.map((entry) =>
              entry && typeof entry === "object"
                  ? { ...entry, team: normalizeTeamRef(entry.team) }
                  : entry
          )
        : teams

module.exports = {
    toTeamId,
    normalizeTeamRef,
    normalizeTeamEntries,
    sameTeamId,
}
