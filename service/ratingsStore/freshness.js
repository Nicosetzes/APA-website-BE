// Frescura de los ratings persistidos: ¿lo guardado en `player-ratings` sigue
// siendo lo que calcularía el motor hoy? Función pura, no lee la base: recibe los
// documentos de jugadores ya leídos y las estadísticas ACTUALES del origen
// (`findRatingSourceStats`).
//
// Un jugador guardado es "fresco" cuando coinciden: la versión de rating, la
// huella (config + datos de equipos + versión del motor y del esquema) y el
// `source` (cantidad de partidos que cumplen el filtro del motor y mayor
// `updatedAt`) contra el estado actual de `matches`.
//
// Limitación conocida: el `source` es una huella barata, no una prueba. Una
// edición nativa o masiva de `matches` que NO suba `updatedAt` y NO cambie la
// cantidad de partidos del filtro (por ejemplo corregir un marcador con un
// update directo en la base) no se detecta. Un alta o una baja sí la detecta el
// conteo. Tras migraciones o scripts nativos sobre `matches` hay que re-correr
// `npm run recompute:ratings -- --apply`.
//
// Razones, en el orden en que se evalúan (la primera que aplica gana).
const FRESHNESS_REASONS = Object.freeze([
    "no_players",
    "version_mismatch",
    "inconsistent_players",
    "fingerprint_mismatch",
    "missing_source",
    "stale_count",
    "stale_updated_at",
    "ok",
])

const isNonEmptyString = (value) => typeof value === "string" && value !== ""
const isValidDate = (value) =>
    value instanceof Date && !Number.isNaN(value.getTime())
const isCount = (value) => Number.isInteger(value) && value >= 0

// `source` guardado: objeto con `ratedMatches` entero >= 0 y `maxUpdatedAt`
// Date válida o ausente (`null` / `undefined`).
const hasValidSource = (doc) => {
    const source = doc?.source
    if (typeof source !== "object" || source === null) return false
    if (!isCount(source.ratedMatches)) return false
    const { maxUpdatedAt } = source
    return (
        maxUpdatedAt === null ||
        maxUpdatedAt === undefined ||
        isValidDate(maxUpdatedAt)
    )
}

// Las fechas se comparan por tiempo; `null` y `undefined` son lo mismo.
const timeOf = (date) =>
    date === null || date === undefined ? null : date.getTime()

const assertInputs = ({
    currentFingerprint,
    currentSourceStats,
    ratingVersion,
}) => {
    if (!isNonEmptyString(currentFingerprint)) {
        throw new TypeError(
            "assessFreshness: currentFingerprint tiene que ser un string no vacío"
        )
    }
    if (!isNonEmptyString(ratingVersion)) {
        throw new TypeError(
            "assessFreshness: ratingVersion tiene que ser un string no vacío"
        )
    }
    if (
        typeof currentSourceStats !== "object" ||
        currentSourceStats === null ||
        !isCount(currentSourceStats.ratedMatches)
    ) {
        throw new TypeError(
            "assessFreshness: currentSourceStats.ratedMatches tiene que ser un entero >= 0"
        )
    }
    const { maxUpdatedAt } = currentSourceStats
    if (maxUpdatedAt !== null && !isValidDate(maxUpdatedAt)) {
        throw new TypeError(
            "assessFreshness: currentSourceStats.maxUpdatedAt tiene que ser una Date válida o null"
        )
    }
}

// `{ fresh, reason }`. `fresh` es `true` solo con `reason: "ok"`. Lanza
// `TypeError` ante entradas inválidas (error de programación, no un dato viejo).
const assessFreshness = ({
    players,
    currentFingerprint,
    currentSourceStats,
    ratingVersion,
} = {}) => {
    assertInputs({ currentFingerprint, currentSourceStats, ratingVersion })
    const stale = (reason) => ({ fresh: false, reason })
    if (!Array.isArray(players) || players.length === 0) {
        return stale("no_players")
    }
    if (players.some((player) => player?.ratingVersion !== ratingVersion)) {
        return stale("version_mismatch")
    }
    const fingerprints = new Set(players.map((player) => player.fingerprint))
    if (fingerprints.size !== 1) return stale("inconsistent_players")
    if (!fingerprints.has(currentFingerprint)) {
        return stale("fingerprint_mismatch")
    }
    if (!players.every(hasValidSource)) return stale("missing_source")
    const [first] = players
    const sameSource = players.every(
        (player) =>
            player.source.ratedMatches === first.source.ratedMatches &&
            timeOf(player.source.maxUpdatedAt) ===
                timeOf(first.source.maxUpdatedAt)
    )
    if (!sameSource) return stale("inconsistent_players")
    if (first.source.ratedMatches !== currentSourceStats.ratedMatches) {
        return stale("stale_count")
    }
    if (
        timeOf(first.source.maxUpdatedAt) !==
        timeOf(currentSourceStats.maxUpdatedAt)
    ) {
        return stale("stale_updated_at")
    }
    return { fresh: true, reason: "ok" }
}

module.exports = { FRESHNESS_REASONS, assessFreshness }
