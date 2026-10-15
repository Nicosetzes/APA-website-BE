const { isReadModelEnabled } = require("../../config/ratingReadModel")
const { isRateable } = require("../playerRatings")

const toPlain = (match) =>
    typeof match?.toJSON === "function" ? match.toJSON() : { ...match }

// Agrega `ratingChange` a cada partido de la página de GET /api/matches:
// `{ p1, p2, ratingVersion }` (puntos de rating que ganó o perdió cada jugador)
// o `null`. Es un adorno: ante cualquier falla devuelve la página original sin
// tocar (o con `ratingChange: null` en todos) y nunca rechaza ni cambia el
// resto de los campos.
//
// `null` cuando: el partido no tiene evento (pendiente, inválido, simulado, mismo
// jugador en ambos lados), lo guardado no está fresco, el interruptor
// `RATING_READ_MODEL` está apagado o la lectura falla.
const isCandidate = (match) => match.played !== false && isRateable(match)

const decorateMatchesWithRatingChange = async ({
    payload,
    retrieveRatingChanges,
    readModelEnabled = isReadModelEnabled,
    logger,
    clock = Date.now,
}) => {
    try {
        const matches = payload?.matches
        if (!Array.isArray(matches) || matches.length === 0) return payload

        const plain = matches.map(toPlain)
        const startedAt = clock()
        let changes = new Map()
        let source = "none"
        let reason = "disabled"
        let errorName

        try {
            if (readModelEnabled()) {
                const result = await retrieveRatingChanges({
                    matchIds: plain
                        .filter(isCandidate)
                        .map((match) => String(match._id)),
                })
                if (result.changes instanceof Map) {
                    changes = result.changes
                    source = "stored"
                    reason = "ok"
                } else {
                    reason = result.stale
                }
            }
        } catch (error) {
            reason = "error"
            errorName = error?.name
        }

        try {
            logger?.[reason === "error" ? "warn" : "info"]?.(
                "matches_rating_change",
                {
                    source,
                    reason,
                    matches: plain.length,
                    durationMs: clock() - startedAt,
                    ...(errorName && { errorName }),
                }
            )
        } catch {
            // El log no puede romper la respuesta.
        }

        return {
            ...payload,
            matches: plain.map((match) => ({
                ...match,
                ratingChange: changes.get(String(match._id)) ?? null,
            })),
        }
    } catch {
        return payload
    }
}

module.exports = { decorateMatchesWithRatingChange }
