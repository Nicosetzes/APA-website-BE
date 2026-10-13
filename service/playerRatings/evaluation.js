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

const mean = (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

// Mejora pareada del log-loss de `candidate` respecto de `base` en los mismos
// partidos: media de (pérdida base - pérdida candidato) y su error estándar.
// Mayor que 0 es mejor que la base.
const pairedGain = (base, candidate, indexes) => {
    const diffs = indexes.map(
        (index) =>
            softLogLoss(base[index].expectedP1, base[index].resultP1) -
            softLogLoss(candidate[index].expectedP1, candidate[index].resultP1)
    )
    const average = mean(diffs)
    const variance =
        diffs.length > 1
            ? diffs.reduce((total, diff) => total + (diff - average) ** 2, 0) /
              (diffs.length - 1)
            : 0
    return {
        gain: average,
        standardError: diffs.length ? Math.sqrt(variance / diffs.length) : 0,
        matches: diffs.length,
    }
}

// Compara distintos `teamStrengthWeight` (0 = rating 1.0) sobre los mismos
// partidos. Se simula cronológicamente una vez por peso y se miden solo los
// partidos evaluables (ambos jugadores con `minGames` partidos previos; los
// `games` no dependen del peso, así que son los mismos para todos). Esos
// partidos se parten en orden cronológico (`splitRatio` para elegir, el resto
// para medir) y el peso elegido es el de menor log-loss en el tramo de elegir.
// Las diferencias son pareadas contra el peso 0.
//
// A diferencia de `tuneRatingParameters`, que parte todos los partidos y recién
// después filtra, acá el 70/30 es entre evaluables.
const compareTeamStrength = (
    matches,
    weights,
    { splitRatio = 0.7, minGames = 10, options = {} } = {}
) => {
    const simulate = (weight) =>
        calculatePlayerRatings(matches, {
            ...options,
            teamStrengthWeight: weight,
        }).events

    const baseline = simulate(0)
    const evaluable = baseline
        .map((event, index) =>
            event.p1.games >= minGames && event.p2.games >= minGames
                ? index
                : -1
        )
        .filter((index) => index >= 0)
    if (!evaluable.length || !weights.length) return null

    const splitIndex = Math.floor(evaluable.length * splitRatio)
    const subsets = {
        all: evaluable,
        train: evaluable.slice(0, splitIndex),
        test: evaluable.slice(splitIndex),
    }

    const results = weights.map((weight) => {
        const events = weight === 0 ? baseline : simulate(weight)
        const measure = (indexes) =>
            evaluateEvents(
                indexes.map((index) => events[index]),
                { minGames }
            )

        return {
            weight,
            all: measure(subsets.all),
            train: measure(subsets.train),
            test: measure(subsets.test),
            pairedAll: pairedGain(baseline, events, subsets.all),
            pairedTest: pairedGain(baseline, events, subsets.test),
        }
    })

    const best = results
        .filter(({ train }) => train.logLoss !== null)
        .reduce(
            (winner, candidate) =>
                !winner || candidate.train.logLoss < winner.train.logLoss
                    ? candidate
                    : winner,
            null
        )

    return {
        totalEvents: baseline.length,
        evaluableMatches: evaluable.length,
        trainMatches: subsets.train.length,
        testMatches: subsets.test.length,
        results,
        best,
    }
}

// ¿Importa el equipo que se usa, más allá del jugador? Para cada equipo se suma
// cuánto rindió por encima o por debajo de lo que el Elo esperaba (residuo; con
// la 2.0 el esperado ya incluye el overall del equipo, así que lo que queda es
// lo que el overall no explica) y
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
    compareTeamStrength,
    evaluateEvents,
    softLogLoss,
    summarizeTeamEffect,
    tuneRatingParameters,
}
