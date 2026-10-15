const matchesModel = require("./../models/matches.js")
const { RATING_FILTER } = require("./../findRatingMatches")

// Estadísticas del origen de los ratings: cuántos partidos cumplen el filtro del
// motor y cuándo se tocó el último. Es UNA sola operación (un aggregate) y no
// transfiere documentos, solo un resultado de una fila.
//
// `ratedMatches` cuenta los partidos que matchean `RATING_FILTER`, no los
// eventos del motor: puede ser MAYOR que `eventCount`, porque el filtro incluye
// partidos jugados y válidos que el motor no rateó (sin goles enteros, mismo
// jugador de ambos lados, sin jugador). Lo que se compara es siempre la misma
// query contra la misma query.
//
// `maxUpdatedAt` es `Date` o `null` (sin partidos, o ninguno con `updatedAt`:
// los legados pueden no tenerlo).
const findRatingSourceStats = async ({ model = matchesModel } = {}) => {
    const rows = await model.aggregate([
        { $match: { ...RATING_FILTER } },
        {
            $group: {
                _id: null,
                ratedMatches: { $sum: 1 },
                maxUpdatedAt: { $max: "$updatedAt" },
            },
        },
    ])
    const row = Array.isArray(rows) ? rows[0] : undefined
    if (!row) return { ratedMatches: 0, maxUpdatedAt: null }
    return {
        ratedMatches: row.ratedMatches,
        maxUpdatedAt: row.maxUpdatedAt ?? null,
    }
}

module.exports = findRatingSourceStats
