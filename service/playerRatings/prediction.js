const { DRAW_MODEL } = require("../../config/drawModel")
const { isReadModelEnabled } = require("../../config/ratingReadModel")
const { buildRatingsTimeline } = require("./timeline")
const { expectedForMatch, isRateable } = require("./index")
const { outcomeProbabilities } = require("./outcomes")

// Predicciones de un partido según el APA Rating 2.0. Hay dos formas, y
// `predictionKind` decide cuál corresponde:
//
// - "advance" ({ p1, p2, ... }): "Prob. de éxito" en un cruce de eliminación de
//   partido único. No hay empate final (se define por penales, que el motor
//   cuenta 0,5), así que el puntaje esperado es la probabilidad de AVANZAR, no
//   de ganar en los 90 minutos.
// - "outcomes" ({ kind: "outcomes", p1Win, draw, p2Win, ... }): victoria /
//   empate / derrota de un partido que puede empatarse (liga, playoffs de la
//   Champions, ida y vuelta). Reparte el mismo puntaje esperado con el modelo de
//   empate de `config/drawModel.js`. Es por partido, no por serie.
//
// El motor de ratings no cambia: esta capa solo lee su puntaje esperado. Nada se
// guarda: partidos jugados usan el evento que calcula el motor (odds previas al
// partido) y los pendientes usan los ratings actuales.

const idOf = (reference) =>
    reference?.id === undefined || reference?.id === null
        ? null
        : String(reference.id)

// Solo los cruces de partido único tienen una probabilidad de avanzar bien
// definida. La Champions (ida y vuelta legacy) y el playoff de dos piernas no.
const isSingleLegTournament = (tournament) =>
    tournament?.format !== "champions_league" &&
    !(
        tournament?.format === "playoff" &&
        tournament?.playoffMode === "two_legged"
    )

// Corre el motor una vez sobre todo el historial y deja a mano los eventos por
// partido y el estado actual de cada jugador. `options` es el mismo que acepta
// `calculatePlayerRatings` (sirve para tests).
const buildPredictionIndex = (allMatches, options = {}) => {
    const timeline = buildRatingsTimeline(allMatches, options)

    return {
        eventsByMatchId: timeline.eventsByMatchId,
        snapshot: timeline.snapshotAt(null),
        config: timeline.config,
        lookup: timeline.lookup,
    }
}

// Redondea a 3 decimales y deriva p2 de p1 para que ambos sumen 1.
const toProbabilities = (expectedP1) => {
    const thousandths = Math.round(expectedP1 * 1000)
    return {
        p1: thousandths / 1000,
        p2: (1000 - thousandths) / 1000,
    }
}

// Puntaje esperado del duelo y su contexto, o `null` si el duelo no tiene
// predicción posible: lado vacío (jugador o equipo), mismo jugador en ambos
// lados, partido inválido (SIM o W.O.) o jugado sin evento del motor.
const resolveExpected = (match, index) => {
    const player1 = idOf(match?.playerP1)
    const player2 = idOf(match?.playerP2)

    if (
        player1 === null ||
        player2 === null ||
        idOf(match.teamP1) === null ||
        idOf(match.teamP2) === null ||
        player1 === player2 ||
        match.valid === false
    ) {
        return null
    }

    const { config } = index
    let expectedP1
    let basis
    let teamAdjusted
    let games1
    let games2

    if (match.played === false) {
        const state1 = index.snapshot.get(player1)
        const state2 = index.snapshot.get(player2)
        const expected = expectedForMatch({
            rating1: state1?.rating ?? config.initialRating,
            rating2: state2?.rating ?? config.initialRating,
            match,
            config,
            lookup: index.lookup,
        })
        expectedP1 = expected.expectedP1
        basis = "current"
        teamAdjusted = expected.teamOverall1 !== null
        games1 = state1?.matches ?? 0
        games2 = state2?.matches ?? 0
    } else {
        const event = index.eventsByMatchId.get(String(match._id))
        if (!event) return null
        expectedP1 = event.expectedP1
        basis = "pre_match"
        teamAdjusted = event.p1.teamOverall !== null
        games1 = event.p1.games
        games2 = event.p2.games
    }

    return {
        expectedP1,
        basis,
        teamAdjusted,
        provisional: Math.min(games1, games2) < config.provisionalMatches,
        ratingVersion: config.version,
    }
}

// `{ p1, p2, basis, teamAdjusted, provisional, ratingVersion }` o `null`.
// Probabilidad de avanzar en un cruce de partido único.
const predictMatch = (match, index) => {
    const resolved = resolveExpected(match, index)
    if (resolved === null) return null

    return {
        ...toProbabilities(resolved.expectedP1),
        basis: resolved.basis,
        teamAdjusted: resolved.teamAdjusted,
        provisional: resolved.provisional,
        ratingVersion: resolved.ratingVersion,
    }
}

// `{ kind: "outcomes", p1Win, draw, p2Win, basis, teamAdjusted, provisional,
// ratingVersion, drawModelVersion }` o `null`. Victoria / empate / derrota de un
// partido que puede terminar empatado. No cambia el rating: solo reparte el
// puntaje esperado del motor con el modelo de empate.
const predictOutcomes = (match, index, drawModel = DRAW_MODEL) => {
    const resolved = resolveExpected(match, index)
    if (resolved === null) return null

    const probabilities = outcomeProbabilities(resolved.expectedP1, drawModel)
    if (probabilities === null) return null

    return {
        kind: "outcomes",
        p1Win: probabilities.p1Win,
        draw: probabilities.draw,
        p2Win: probabilities.p2Win,
        basis: resolved.basis,
        teamAdjusted: resolved.teamAdjusted,
        provisional: resolved.provisional,
        ratingVersion: resolved.ratingVersion,
        drawModelVersion: drawModel.version,
    }
}

// Qué tipo de predicción corresponde a un partido: "outcomes" (se puede
// empatar), "advance" (partido único, hay ganador sí o sí) o `null` (sin
// predicción: ej. el desempate de un cruce a dos piernas o un play-in de
// Champions).
const predictionKind = ({ match, tournament }) => {
    if (match?.type === "regular") return "outcomes"

    if (tournament?.format === "champions_league") {
        return match?.type === "playoff" ? "outcomes" : null
    }

    if (
        tournament?.format === "playoff" &&
        tournament?.playoffMode === "two_legged"
    ) {
        return match?.type === "playoff" &&
            (match?.leg === 1 || match?.leg === 2)
            ? "outcomes"
            : null
    }

    return "advance"
}

const toPlain = (match) =>
    typeof match?.toJSON === "function" ? match.toJSON() : { ...match }

// Ids (únicos, como string) de los partidos que EXIGEN un evento guardado: los
// que admiten predicción, ya se jugaron y el motor los rateó (`isRateable`). Un
// partido jugado que no es rateable (sin goles, SIM o W.O.) no exige evento: en
// el camino en vivo también da `null`. Los pendientes no tienen evento.
const collectRequiredEventIds = (plain, kinds) => {
    const ids = new Set()
    plain.forEach((match, position) => {
        if (
            kinds[position] !== null &&
            match.played !== false &&
            isRateable(match)
        ) {
            ids.add(String(match._id))
        }
    })
    return [...ids]
}

const hasOwnKeys = (value) =>
    value !== null && typeof value === "object" && Object.keys(value).length > 0

const isStoredIndex = (index) =>
    index !== null &&
    typeof index === "object" &&
    index.eventsByMatchId instanceof Map &&
    index.snapshot instanceof Map

// Intenta el índice guardado. Nunca lanza: devuelve `{ index }` si se puede usar
// o `{ reason, errorName? }` con el motivo para caer al camino en vivo.
const tryStoredIndex = async ({
    retrieveStoredIndex,
    readModelEnabled,
    options,
    matchIds,
}) => {
    // Las `options` (solo tests / evaluación) no son comparables con lo guardado,
    // que se calculó con la configuración de producción.
    try {
        if (!readModelEnabled() || hasOwnKeys(options)) {
            return { reason: "disabled" }
        }

        const response = await retrieveStoredIndex({ matchIds })
        if (isStoredIndex(response?.index)) return { index: response.index }
        if (typeof response?.stale === "string") {
            return { reason: response.stale }
        }
        return { reason: "error", errorName: "MalformedStoredResponse" }
    } catch (error) {
        return { reason: "error", errorName: error?.name || "Error" }
    }
}

// Agrega `prediction` a cada partido sin tocar el resto de sus campos. Es un
// adorno: ante cualquier falla devuelve `prediction: null` para que la llave
// nunca se rompa. Cada partido recibe la predicción que indica `predictionKind`.
// No lee la base si no hay partidos o ninguno admite predicción.
//
// Si llega `retrieveStoredIndex`, primero prueba el índice armado desde los
// ratings persistidos (etapa 2). Si está desactualizado, falla, el interruptor
// `RATING_READ_MODEL` lo apaga o hay `options` inyectadas, calcula en vivo como
// siempre (`retrieveAllMatches`). El resultado es el mismo en ambos caminos.
// Emite UNA línea `rating_read_model` por respuesta decorada (sin ids), solo
// cuando el índice guardado está cableado.
const decorateMatchesWithPrediction = async ({
    matches,
    tournament,
    retrieveAllMatches,
    retrieveStoredIndex,
    readModelEnabled = isReadModelEnabled,
    logger,
    options,
    clock = Date.now,
}) => {
    const plain = (matches || []).map(toPlain)
    const withoutPrediction = () =>
        plain.map((match) => ({ ...match, prediction: null }))
    const kinds = plain.map((match) => predictionKind({ match, tournament }))

    if (kinds.every((kind) => kind === null)) {
        return withoutPrediction()
    }

    const useStored = typeof retrieveStoredIndex === "function"
    const startedAt = clock()
    let source = "live"
    let reason = "disabled"
    let errorName
    let decorated

    try {
        let index
        if (useStored) {
            const stored = await tryStoredIndex({
                retrieveStoredIndex,
                readModelEnabled,
                options,
                matchIds: collectRequiredEventIds(plain, kinds),
            })
            if (stored.index) {
                index = stored.index
                source = "stored"
                reason = "ok"
            } else {
                reason = stored.reason
                errorName = stored.errorName
            }
        }

        if (!index) {
            index = buildPredictionIndex(await retrieveAllMatches(), options)
        }

        decorated = plain.map((match, position) => {
            const kind = kinds[position]
            let prediction = null
            if (kind === "outcomes") prediction = predictOutcomes(match, index)
            if (kind === "advance") prediction = predictMatch(match, index)
            return { ...match, prediction }
        })
    } catch (error) {
        logger.warn("match_predictions_unavailable", {
            tournamentId: String(tournament?._id ?? tournament?.id ?? ""),
            message: error.message,
        })
        decorated = withoutPrediction()
    }

    if (useStored) {
        const fields = {
            source,
            reason,
            matches: plain.length,
            durationMs: Math.max(0, Math.round(clock() - startedAt)),
        }
        if (reason === "error") {
            fields.errorName = errorName
            logger.warn?.("rating_read_model", fields)
        } else {
            logger.info?.("rating_read_model", fields)
        }
    }

    return decorated
}

module.exports = {
    buildPredictionIndex,
    collectRequiredEventIds,
    decorateMatchesWithPrediction,
    isSingleLegTournament,
    predictionKind,
    predictMatch,
    predictOutcomes,
}
