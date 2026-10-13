const { calculatePlayerRatings } = require("./index")

const EPSILON = 1e-9

const clamp = (value) => Math.min(1 - EPSILON, Math.max(EPSILON, value))

// Log-loss con resultado "blando": 1, 0,5 o 0. Un modelo que siempre dice 0,5
// da ln(2) ≈ 0,693 sin importar el resultado, y es el piso a superar.
const softLogLoss = (expected, result) =>
    -(
        result * Math.log(clamp(expected)) +
        (1 - result) * Math.log(1 - clamp(expected))
    )

const CALIBRATION_BUCKETS = [
    [0.5, 0.6],
    [0.6, 0.7],
    [0.7, 0.8],
    [0.8, 0.9],
    [0.9, 1.0001],
]

// Evalúa las predicciones tal como se hicieron: cada partido se predice con los
// ratings anteriores a jugarse. Se ignoran los partidos donde algún jugador
// todavía no tiene `minGames` partidos, porque ahí el rating no dice nada.
const evaluateEvents = (events, { minGames = 10 } = {}) => {
    const evaluated = events.filter(
        (event) => event.p1.games >= minGames && event.p2.games >= minGames
    )

    const buckets = CALIBRATION_BUCKETS.map(([from, to]) => ({
        from,
        to: Math.min(to, 1),
        matches: 0,
        predicted: 0,
        actual: 0,
    }))

    let logLoss = 0
    let brier = 0
    let baselineBrier = 0
    let decisive = 0
    let favoriteWon = 0
    let sideScore = 0

    for (const event of evaluated) {
        const { expectedP1, resultP1 } = event

        logLoss += softLogLoss(expectedP1, resultP1)
        brier += (expectedP1 - resultP1) ** 2
        baselineBrier += (0.5 - resultP1) ** 2
        sideScore += resultP1

        if (resultP1 !== 0.5 && expectedP1 !== 0.5) {
            decisive += 1
            if (expectedP1 > 0.5 === (resultP1 === 1)) favoriteWon += 1
        }

        // Calibración desde el lado del favorito.
        const favoriteExpected = Math.max(expectedP1, 1 - expectedP1)
        const favoriteResult = expectedP1 >= 0.5 ? resultP1 : 1 - resultP1
        const bucket = buckets.find(
            ({ from, to }) => favoriteExpected >= from && favoriteExpected < to
        )
        if (bucket) {
            bucket.matches += 1
            bucket.predicted += favoriteExpected
            bucket.actual += favoriteResult
        }
    }

    const n = evaluated.length
    const mean = (total) => (n ? total / n : null)

    return {
        matches: n,
        logLoss: mean(logLoss),
        baselineLogLoss: n ? Math.LN2 : null,
        brier: mean(brier),
        baselineBrier: mean(baselineBrier),
        favoriteAccuracy: decisive ? favoriteWon / decisive : null,
        decisiveMatches: decisive,
        // Puntaje medio del jugador 1: si se aleja de 0,5 hay ventaja de lado.
        player1AverageScore: mean(sideScore),
        calibration: buckets.map((bucket) => ({
            from: bucket.from,
            to: bucket.to,
            matches: bucket.matches,
            predicted: bucket.matches
                ? bucket.predicted / bucket.matches
                : null,
            actual: bucket.matches ? bucket.actual / bucket.matches : null,
        })),
    }
}

const cartesian = (grid) =>
    Object.entries(grid).reduce(
        (combinations, [key, values]) =>
            combinations.flatMap((combination) =>
                values.map((value) => ({ ...combination, [key]: value }))
            ),
        [{}]
    )

// Prueba cada combinación del grid: elige la mejor con el tramo inicial de la
// historia (`splitRatio`) y la mide con el tramo final, que no vio al elegir.
// Así se evita premiar parámetros que sólo "memorizaron" el pasado.
const tuneRatingParameters = (
    matches,
    grid,
    { splitRatio = 0.7, minGames = 10 } = {}
) => {
    const results = cartesian(grid).map((parameters) => {
        const { events } = calculatePlayerRatings(matches, parameters)
        const splitIndex = Math.floor(events.length * splitRatio)

        return {
            parameters,
            train: evaluateEvents(events.slice(0, splitIndex), { minGames }),
            test: evaluateEvents(events.slice(splitIndex), { minGames }),
            events,
        }
    })

    const scored = results.filter(({ train }) => train.logLoss !== null)
    const best = scored.reduce(
        (winner, candidate) =>
            !winner || candidate.train.logLoss < winner.train.logLoss
                ? candidate
                : winner,
        null
    )

    return {
        results: results.map(({ events, ...rest }) => rest),
        best: best && {
            parameters: best.parameters,
            train: best.train,
            test: best.test,
        },
        totalEvents: results[0]?.events.length ?? 0,
    }
}

// ¿Importa el equipo que se usa, más allá del jugador? Para cada equipo se suma
// cuánto rindió por encima o por debajo de lo que el Elo esperaba (residuo) y
// se lo compara con el ruido que habría por puro azar. Si bastantes equipos
// pasan de |z| = 2 más allá de lo que daría el azar (~4,5%), hay señal de que
// la fuerza del equipo explica parte de los resultados.
const summarizeTeamEffect = (
    events,
    { minGames = 10, minMatches = 20 } = {}
) => {
    const evaluated = events.filter(
        (event) => event.p1.games >= minGames && event.p2.games >= minGames
    )
    if (!evaluated.length) return null

    const residualSd = Math.sqrt(
        evaluated.reduce(
            (total, { resultP1, expectedP1 }) =>
                total + (resultP1 - expectedP1) ** 2,
            0
        ) / evaluated.length
    )

    const byTeam = new Map()
    const add = (team, residual) => {
        if (!team) return
        const entry = byTeam.get(team) ?? { team, matches: 0, sum: 0 }
        entry.matches += 1
        entry.sum += residual
        byTeam.set(team, entry)
    }

    for (const { p1, p2, resultP1, expectedP1 } of evaluated) {
        const residual = resultP1 - expectedP1
        add(p1.team, residual)
        add(p2.team, -residual)
    }

    const teams = [...byTeam.values()]
        .filter(({ matches }) => matches >= minMatches)
        .map(({ team, matches, sum }) => ({
            team,
            matches,
            meanResidual: sum / matches,
            z: sum / (residualSd * Math.sqrt(matches)),
        }))
        .sort((a, b) => b.z - a.z)

    return {
        distinctTeams: byTeam.size,
        teamsEvaluated: teams.length,
        flagged: teams.filter(({ z }) => Math.abs(z) > 2).length,
        expectedByChance: teams.length * 0.0455,
        residualSd,
        top: teams.slice(0, 5),
        bottom: teams.slice(-5).reverse(),
    }
}

module.exports = {
    evaluateEvents,
    softLogLoss,
    summarizeTeamEffect,
    tuneRatingParameters,
}
