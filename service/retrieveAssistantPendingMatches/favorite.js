const { FAVORITE_LEVELS } = require("../../config/assistant")
// Favorito de un partido pendiente para el asistente. Sale de la predicción del
// APA Rating 2.0 (`service/playerRatings/prediction.js`), que no se modifica:
// acá solo se la resume en algo compacto y se etiqueta. Se muestra únicamente
// al favorito y su probabilidad de GANAR ("outcomes") o de AVANZAR ("advance");
// nunca el empate, la del rival, ids ni versiones del modelo.
const toMilli = (probability) => Math.round(probability * 1000)
const isProbability = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
const isName = (value) => typeof value === "string" && value.trim() !== ""
// Probabilidades de cada lado y empate, en milésimas enteras (sin errores de
// punto flotante en los bordes de las etiquetas), o `null` si no son válidas.
const readMilli = (prediction) => {
    if (prediction === null || typeof prediction !== "object") return null
    if (prediction.kind === "outcomes") {
        const { p1Win, draw, p2Win } = prediction
        if (![p1Win, draw, p2Win].every(isProbability)) return null
        return {
            outcome: "win",
            p1: toMilli(p1Win),
            p2: toMilli(p2Win),
            draw: toMilli(draw),
        }
    }
    if (![prediction.p1, prediction.p2].every(isProbability)) return null
    return {
        outcome: "advance",
        p1: toMilli(prediction.p1),
        p2: toMilli(prediction.p2),
        draw: 0,
    }
}
// `{ player, label, probabilityPercent, outcome, provisional }` o `null` si no
// hay un favorito claro: predicción ausente o inválida, duelo parejo (puntaje
// esperado del favorito debajo del primer nivel), probabilidades iguales o
// nombre faltante. No lanza.
const buildFavorite = (prediction, { p1Name, p2Name } = {}) => {
    const read = readMilli(prediction)
    if (read === null || read.p1 === read.p2) return null
    const isP1 = read.p1 > read.p2
    const player = isP1 ? p1Name : p2Name
    if (!isName(player)) return null
    const favoriteMilli = isP1 ? read.p1 : read.p2
    // Puntaje esperado del favorito en 1/2000: ganar + empate / 2.
    const score = 2 * favoriteMilli + read.draw
    const level = FAVORITE_LEVELS.find(({ minScore }) => score >= 2 * minScore)
    if (!level) return null
    return {
        player,
        label: level.label,
        probabilityPercent: Math.round(favoriteMilli / 10),
        outcome: read.outcome,
        provisional: prediction.provisional === true,
    }
}
// Etiqueta de favorito para un puntaje esperado del favorito (0 a 1), con los
// mismos niveles que `buildFavorite`. `null` si no llega al primero (duelo
// parejo) o si el puntaje no es válido. Lo usa también el contexto del recap.
const favoriteLevelForScore = (score) => {
    if (!isProbability(score)) return null
    const milli = toMilli(score)
    const level = FAVORITE_LEVELS.find(({ minScore }) => milli >= minScore)
    return level ? level.label : null
}
const groupByTournament = (items) => {
    const groups = new Map()
    for (const item of items) {
        if (!groups.has(item.tournamentId)) groups.set(item.tournamentId, [])
        groups.get(item.tournamentId).push(item)
    }
    return groups
}
// Calcula el favorito de cada item. `addPredictions({ matches, tournament })`
// es `decorateMatchesWithPrediction` con sus dependencias ya inyectadas, que
// resuelve UN torneo por llamada (el tipo de predicción depende del formato y
// del modo del playoff), así que se llama una vez por torneo. Los partidos
// pendientes no traen `played` en la proyección del DAO: se fuerza `false` para
// que la predicción use los ratings actuales.
//
// Es un adorno: no muta los items y nunca lanza. Si falla el cálculo de un
// torneo (o falta el partido crudo, el torneo o el partido decorado), sus items
// salen SIN la clave `favorite`. Un partido sin predicción lleva `favorite: null`.
const attachFavorites = async ({
    items,
    rawById,
    tournamentsById,
    addPredictions,
    logger,
}) => {
    const favoriteByMatchId = new Map()
    const decorateGroup = async ([tournamentId, group]) => {
        try {
            const tournament = tournamentsById.get(tournamentId)
            if (!tournament || group.some((item) => !rawById.has(item.matchId)))
                return
            const decorated = await addPredictions({
                matches: group.map((item) => ({
                    ...rawById.get(item.matchId),
                    played: false,
                })),
                tournament,
            })
            if (!Array.isArray(decorated)) return
            const predictionById = new Map(
                decorated.map((match) => [String(match?._id), match])
            )
            for (const item of group) {
                const match = predictionById.get(item.matchId)
                if (!match) continue
                favoriteByMatchId.set(
                    item.matchId,
                    buildFavorite(match.prediction, {
                        p1Name: item.p1?.name,
                        p2Name: item.p2?.name,
                    })
                )
            }
        } catch (error) {
            logger?.warn?.("assistant_favorites_unavailable", {
                tournamentId,
                message: error?.message,
            })
        }
    }
    await Promise.all([...groupByTournament(items)].map(decorateGroup))
    return items.map((item) =>
        favoriteByMatchId.has(item.matchId)
            ? { ...item, favorite: favoriteByMatchId.get(item.matchId) }
            : item
    )
}
module.exports = { attachFavorites, buildFavorite, favoriteLevelForScore }
