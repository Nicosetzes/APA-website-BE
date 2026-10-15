// Cuentas puras del script `evaluateDraws` (no tocan la base ni la config).
// Trabajan sobre los eventos del motor de ratings: cada uno trae el puntaje
// esperado de P1 (`expectedP1`), los goles (`scoreP1`, `scoreP2`) y el `type`.

const { splitOutcomes } = require("../../service/playerRatings/outcomes")

// Log-loss de tres resultados de una predicción al azar (1/3 cada uno).
const RANDOM_LOG_LOSS = Math.log(3)

// Mezcla con la uniforme para que un resultado con probabilidad 0 no dé infinito.
const DEFAULT_EPSILON = 0.01

const CALIBRATION_BUCKETS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0001]
const WINDOW_CENTERS = [0.55, 0.6, 0.7, 0.8, 0.9]
const WINDOW_HALF_WIDTH = 0.05
const TAIL_FROM = 0.95
const VALIDATION_BLOCKS = 10
const FIRST_TEST_BLOCK = 5

const SHAPE_D0_VALUES = Array.from(
    { length: 37 },
    (_, index) => 0.04 + index * 0.01
)
const SHAPE_K_VALUES = [0, 0.5, 1, 1.5, 2, 3, 4]
const CONSTANT_D0_VALUES = Array.from(
    { length: 73 },
    (_, index) => 0.04 + index * 0.005
)

const parseArguments = (argv) => {
    const valueOf = (flag) => {
        const index = argv.indexOf(flag)
        if (index === -1) return undefined
        const value = argv[index + 1]
        if (!value || value.startsWith("--")) {
            throw new Error(`${flag} necesita un valor`)
        }
        return value
    }

    return { uriEnv: valueOf("--uri-env") ?? "MONGO_URI" }
}

// Resultado real desde P1: 0 = gana P1, 1 = empate, 2 = gana P2.
const actualResult = (event) => {
    if (event.scoreP1 > event.scoreP2) return 0
    return event.scoreP1 === event.scoreP2 ? 1 : 2
}

const selectLeagueEvents = (events) =>
    events.filter((event) => event.type === "regular")

const drawRate = (events) =>
    events.length
        ? events.filter((event) => actualResult(event) === 1).length /
          events.length
        : null

const standardError = (probability, n) =>
    n > 0 ? Math.sqrt((probability * (1 - probability)) / n) : null

// Log-loss medio de tres resultados con `params` = { d0, k } (menor es mejor).
const logLoss = (events, params, epsilon = DEFAULT_EPSILON) => {
    if (!events.length) return null
    let sum = 0
    for (const event of events) {
        const { p1Win, draw, p2Win } = splitOutcomes(event.expectedP1, params)
        const probability = [p1Win, draw, p2Win][actualResult(event)]
        sum += -Math.log((1 - 3 * epsilon) * probability + epsilon)
    }
    return sum / events.length
}

const fitBest = (events, candidates) => {
    let best = null
    for (const params of candidates) {
        const loss = logLoss(events, params)
        if (best === null || loss < best.loss) best = { ...params, loss }
    }
    return best
}

// Mejor { d0, k, loss } de la grilla d0 0,04-0,40 (paso 0,01) x k.
const fitShape = (events) =>
    fitBest(
        events,
        SHAPE_D0_VALUES.flatMap((d0) => SHAPE_K_VALUES.map((k) => ({ d0, k })))
    )

// Mejor empate constante { d0, k: 0, loss } (paso 0,005).
const fitConstant = (events) =>
    fitBest(
        events,
        CONSTANT_D0_VALUES.map((d0) => ({ d0, k: 0 }))
    )

// Desde el lado favorito (el de mayor puntaje esperado; en E = 0,5 es P1).
const favouriteView = (event) => {
    const favouriteIsP1 = event.expectedP1 >= 0.5
    const result = actualResult(event)
    return {
        expected: favouriteIsP1 ? event.expectedP1 : 1 - event.expectedP1,
        draw: result === 1,
        favouriteWon: result !== 1 && (result === 0) === favouriteIsP1,
    }
}

const summarizeWindow = (label, views) => {
    const n = views.length
    const draws = views.filter((view) => view.draw).length
    const favouriteWins = views.filter((view) => view.favouriteWon).length
    const rate = (count) => (n ? count / n : null)
    return {
        label,
        n,
        favouriteWin: rate(favouriteWins),
        draw: rate(draws),
        other: rate(n - favouriteWins - draws),
        favouriteWinError: standardError(rate(favouriteWins), n),
        drawError: standardError(rate(draws), n),
    }
}

// Qué pasó realmente según qué tan favorito era el favorito: ventanas de
// ± `halfWidth` alrededor de cada centro y un último tramo abierto (>= tailFrom).
const observedByWindow = (
    events,
    centers = WINDOW_CENTERS,
    halfWidth = WINDOW_HALF_WIDTH,
    tailFrom = TAIL_FROM
) => {
    const views = events.map(favouriteView)
    const rows = centers.map((center) =>
        summarizeWindow(
            `${Math.round(center * 100)}/${Math.round((1 - center) * 100)}`,
            views.filter(
                (view) =>
                    view.expected >= center - halfWidth - 1e-9 &&
                    view.expected < center + halfWidth - 1e-9
            )
        )
    )
    rows.push(
        summarizeWindow(
            `${Math.round(tailFrom * 100)}+/${Math.round(
                (1 - tailFrom) * 100
            )}-`,
            views.filter((view) => view.expected >= tailFrom)
        )
    )
    return rows
}

// Se ajusta con los bloques anteriores y se prueba en el siguiente, de
// `firstTestBlock` a `blocks` (1-indexado). Devuelve el log-loss ponderado por
// cantidad de partidos de prueba de cada modelo.
const chronologicalValidation = (
    events,
    configured,
    blocks = VALIDATION_BLOCKS,
    firstTestBlock = FIRST_TEST_BLOCK
) => {
    const blockSize = Math.floor(events.length / blocks)
    const totals = {
        constant: 0,
        shape: 0,
        configured: 0,
    }
    let testSize = 0
    let testBlocks = 0

    for (let block = firstTestBlock - 1; block < blocks; block += 1) {
        const train = events.slice(0, block * blockSize)
        const test = events.slice(
            block * blockSize,
            block === blocks - 1 ? events.length : (block + 1) * blockSize
        )
        if (!train.length || !test.length) continue

        const constant = fitConstant(train)
        const shape = fitShape(train)
        totals.constant += logLoss(test, constant) * test.length
        totals.shape += logLoss(test, shape) * test.length
        totals.configured += logLoss(test, configured) * test.length
        testSize += test.length
        testBlocks += 1
    }

    if (!testSize) {
        return {
            blocks,
            testBlocks: 0,
            testSize: 0,
            constant: null,
            shape: null,
            configured: null,
        }
    }
    return {
        blocks,
        testBlocks,
        testSize,
        constant: totals.constant / testSize,
        shape: totals.shape / testSize,
        configured: totals.configured / testSize,
    }
}

// Real contra modelo por tramo de puntaje esperado del favorito.
const calibrationRows = (events, params) => {
    const rows = CALIBRATION_BUCKETS.slice(0, -1).map((low, index) => ({
        label: `${low.toFixed(1)}-${Math.min(
            CALIBRATION_BUCKETS[index + 1],
            1
        ).toFixed(1)}`,
        n: 0,
        draws: 0,
        modelDraw: 0,
        favouriteWins: 0,
        modelFavouriteWin: 0,
        expected: 0,
    }))

    for (const event of events) {
        const view = favouriteView(event)
        const index = CALIBRATION_BUCKETS.findIndex(
            (low, position) =>
                view.expected >= low &&
                view.expected < CALIBRATION_BUCKETS[position + 1]
        )
        if (index === -1) continue
        const { p1Win, draw } = splitOutcomes(view.expected, params)
        const row = rows[index]
        row.n += 1
        row.draws += view.draw ? 1 : 0
        row.modelDraw += draw
        row.favouriteWins += view.favouriteWon ? 1 : 0
        row.modelFavouriteWin += p1Win
        row.expected += view.expected
    }

    return rows
        .filter((row) => row.n > 0)
        .map((row) => ({
            label: row.label,
            n: row.n,
            realDraw: row.draws / row.n,
            modelDraw: row.modelDraw / row.n,
            realFavouriteWin: row.favouriteWins / row.n,
            modelFavouriteWin: row.modelFavouriteWin / row.n,
            meanExpected: row.expected / row.n,
        }))
}

module.exports = {
    RANDOM_LOG_LOSS,
    actualResult,
    calibrationRows,
    chronologicalValidation,
    drawRate,
    fitConstant,
    fitShape,
    logLoss,
    observedByWindow,
    parseArguments,
    selectLeagueEvents,
    standardError,
}
