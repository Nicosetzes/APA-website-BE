const {
    calculatePlayerRatings,
    expectedForMatch,
    snapshotBefore,
} = require("./index")
const { defaultTeamStrength } = require("./teamStrength")

// Probabilidad de éxito ("Prob. de éxito") de cada lado en un duelo de
// eliminación de partido único, según el APA Rating 2.0.
//
// El número es el puntaje esperado del motor. En un cruce de partido único no hay
// empate final (se define por penales, que el motor cuenta 0,5), así que el
// puntaje esperado es la probabilidad de AVANZAR, no de ganar en los 90 minutos.
//
// Nada se guarda: partidos jugados usan el evento que calcula el motor (odds
// previas al partido) y los pendientes usan los ratings actuales.

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
    const { events, config } = calculatePlayerRatings(allMatches || [], options)
    // Debe ser el mismo lookup que usó el motor.
    const lookup =
        options.teamStrength === undefined
            ? defaultTeamStrength
            : options.teamStrength
    const eventsByMatchId = new Map()
    for (const event of events) {
        if (event.matchId !== null) eventsByMatchId.set(event.matchId, event)
    }

    return {
        eventsByMatchId,
        snapshot: snapshotBefore(events, null, config.initialRating),
        config,
        lookup,
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

// `{ p1, p2, basis, teamAdjusted, provisional, ratingVersion }` o `null` si el
// duelo no tiene predicción posible: lado vacío (jugador o equipo), mismo jugador
// en ambos lados, partido inválido (SIM o W.O.) o jugado sin evento del motor.
const predictMatch = (match, index) => {
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
        ...toProbabilities(expectedP1),
        basis,
        teamAdjusted,
        provisional: Math.min(games1, games2) < config.provisionalMatches,
        ratingVersion: config.version,
    }
}

const toPlain = (match) =>
    typeof match?.toJSON === "function" ? match.toJSON() : { ...match }

// Agrega `prediction` a cada partido sin tocar el resto de sus campos. Es un
// adorno: ante cualquier falla devuelve `prediction: null` para que la llave
// nunca se rompa. No lee la base si el torneo está fuera de alcance o no hay
// partidos.
const decorateMatchesWithPrediction = async ({
    matches,
    tournament,
    retrieveAllMatches,
    logger,
    options,
}) => {
    const plain = (matches || []).map(toPlain)
    const withoutPrediction = () =>
        plain.map((match) => ({ ...match, prediction: null }))

    if (plain.length === 0 || !isSingleLegTournament(tournament)) {
        return withoutPrediction()
    }

    try {
        const index = buildPredictionIndex(await retrieveAllMatches(), options)
        return plain.map((match) => ({
            ...match,
            prediction: predictMatch(match, index),
        }))
    } catch (error) {
        logger.warn("match_predictions_unavailable", {
            tournamentId: String(tournament?._id ?? tournament?.id ?? ""),
            message: error.message,
        })
        return withoutPrediction()
    }
}

module.exports = {
    buildPredictionIndex,
    decorateMatchesWithPrediction,
    isSingleLegTournament,
    predictMatch,
}
