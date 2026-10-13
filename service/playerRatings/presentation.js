// Armado de la respuesta de los endpoints de rating. Vive junto al motor para
// que el ranking actual y el de un período muestren los mismos datos.

const round = (value, digits = 1) => {
    if (value === null || value === undefined) return null
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
}

const toIso = (time) => (time === null ? null : new Date(time).toISOString())

// Nombre visible de cada jugador: el nickname del usuario y, si el jugador ya
// no existe como usuario, el nombre con que quedó en sus partidos.
const buildNameIndex = (users = []) =>
    new Map(
        users
            .filter((user) => user?.id !== undefined && user?.nickname)
            .map((user) => [String(user.id), user.nickname])
    )

const displayName = (names, player) => names.get(player.id) ?? player.name

const describeParameters = (config) => ({
    initialRating: config.initialRating,
    kFactor: config.kFactor,
    marginWeight: config.marginWeight,
    provisionalMatches: config.provisionalMatches,
})

const toRankingRow = (player, names, config) => ({
    position: player.position,
    player: { id: player.id, name: displayName(names, player) },
    rating: round(player.rating),
    matches: player.matches,
    wins: player.wins,
    draws: player.draws,
    losses: player.losses,
    peak: round(player.peak),
    provisional: player.matches < config.provisionalMatches,
    lastPlayedAt: toIso(player.lastPlayedAt),
    lastChange: round(player.lastChange),
})

module.exports = {
    buildNameIndex,
    describeParameters,
    displayName,
    round,
    toIso,
    toRankingRow,
}
