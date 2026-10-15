"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
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
} = require("../scripts/lib/drawEvaluation")
const { splitOutcomes } = require("../service/playerRatings/outcomes")

const event = (expectedP1, scoreP1, scoreP2, type = "regular") => ({
    expectedP1,
    scoreP1,
    scoreP2,
    type,
})

// Generador congruencial determinista (sin Math.random).
const createRandom = (seed) => {
    let state = seed
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296
        return state / 4294967296
    }
}

// Muestra sintética generada desde un modelo conocido.
const syntheticSample = (params, size, seed) => {
    const random = createRandom(seed)
    const events = []
    for (let index = 0; index < size; index += 1) {
        const expectedP1 = 0.05 + random() * 0.9
        const { p1Win, draw } = splitOutcomes(expectedP1, params)
        const roll = random()
        if (roll < p1Win) events.push(event(expectedP1, 2, 1))
        else if (roll < p1Win + draw) events.push(event(expectedP1, 1, 1))
        else events.push(event(expectedP1, 0, 1))
    }
    return events
}

test("parseArguments defaults to MONGO_URI and reads --uri-env", () => {
    assert.deepEqual(parseArguments([]), { uriEnv: "MONGO_URI" })
    assert.deepEqual(parseArguments(["--uri-env", "MONGO_URI_PROD"]), {
        uriEnv: "MONGO_URI_PROD",
    })
})

test("parseArguments rejects a flag without a value", () => {
    assert.throws(() => parseArguments(["--uri-env"]), /--uri-env necesita/)
    assert.throws(
        () => parseArguments(["--uri-env", "--otro"]),
        /--uri-env necesita/
    )
})

test("actualResult maps scores to win, draw and loss from P1", () => {
    assert.equal(actualResult(event(0.5, 2, 1)), 0)
    assert.equal(actualResult(event(0.5, 1, 1)), 1)
    assert.equal(actualResult(event(0.5, 0, 3)), 2)
})

test("selectLeagueEvents keeps only regular matches", () => {
    const events = [
        event(0.5, 1, 0, "regular"),
        event(0.5, 1, 0, "playoff"),
        event(0.5, 1, 0, "playin"),
        event(0.5, 1, 1, "regular"),
    ]
    assert.equal(selectLeagueEvents(events).length, 2)
    assert.equal(drawRate(selectLeagueEvents(events)), 0.5)
    assert.equal(drawRate([]), null)
})

test("logLoss matches a hand computation with smoothing", () => {
    const params = { d0: 0.2, k: 0 }
    const sample = [event(0.5, 1, 0), event(0.5, 1, 1)]
    // E .5, d .2 -> win .4, draw .2, loss .4; con eps .01: .97 p + .01.
    const expected =
        (-Math.log(0.97 * 0.4 + 0.01) - Math.log(0.97 * 0.2 + 0.01)) / 2
    assert.ok(Math.abs(logLoss(sample, params) - expected) < 1e-12)
    assert.equal(logLoss([], params), null)
})

test("logLoss of a uniform three-way split equals the random baseline", () => {
    // E .5 con draw 1/3 reparte 1/3 a cada resultado.
    const params = { d0: 1 / 3, k: 0 }
    const sample = [event(0.5, 1, 0), event(0.5, 1, 1), event(0.5, 0, 1)]
    assert.ok(Math.abs(logLoss(sample, params, 0) - RANDOM_LOG_LOSS) < 1e-12)
})

test("fitShape and fitConstant recover the parameters of a seeded sample", () => {
    const truth = { d0: 0.3, k: 1 }
    const sample = syntheticSample(truth, 6000, 12345)

    const shape = fitShape(sample)
    assert.ok(Math.abs(shape.d0 - truth.d0) <= 0.05, `d0 ${shape.d0}`)
    assert.ok([0.5, 1, 1.5].includes(shape.k), `k ${shape.k}`)

    const flat = syntheticSample({ d0: 0.2, k: 0 }, 6000, 999)
    const constant = fitConstant(flat)
    assert.equal(constant.k, 0)
    assert.ok(Math.abs(constant.d0 - 0.2) <= 0.03, `d0 ${constant.d0}`)
    assert.ok(shape.loss <= fitConstant(sample).loss + 1e-12)
})

test("observedByWindow splits the favourite wins, draws and the rest", () => {
    const sample = [
        event(0.6, 1, 0), // favorito P1 gana
        event(0.6, 1, 1), // empate
        event(0.6, 0, 1), // gana el otro
        event(0.6, 2, 0), // favorito P1 gana
    ]
    const row = observedByWindow(sample, [0.6])[0]
    assert.equal(row.label, "60/40")
    assert.equal(row.n, 4)
    assert.equal(row.favouriteWin, 0.5)
    assert.equal(row.draw, 0.25)
    assert.equal(row.other, 0.25)
    assert.ok(row.drawError > 0)
})

test("observedByWindow flips the perspective when P2 is the favourite", () => {
    const asP1 = observedByWindow([event(0.7, 1, 0)], [0.7])[0]
    const asP2 = observedByWindow([event(0.3, 0, 1)], [0.7])[0]
    assert.equal(asP1.favouriteWin, 1)
    assert.equal(asP2.favouriteWin, 1)
    const upset = observedByWindow([event(0.3, 1, 0)], [0.7])[0]
    assert.equal(upset.other, 1)
})

test("observedByWindow uses half-open windows and an open tail", () => {
    const sample = [
        event(0.5, 1, 0), // borde inferior de 55 (incluido)
        event(0.6, 1, 0), // borde superior de 55 (fuera), centro de 60
        event(0.96, 1, 0),
        event(0.04, 0, 1),
        event(0.94, 1, 0),
    ]
    const rows = observedByWindow(sample)
    assert.equal(rows[0].n, 1) // 55/45
    assert.equal(rows[1].n, 1) // 60/40
    const tail = rows[rows.length - 1]
    assert.equal(tail.label, "95+/5-")
    assert.equal(tail.n, 2)
    assert.equal(observedByWindow([], [0.55])[0].favouriteWin, null)
})

test("chronologicalValidation uses blocks 5 to 10 and returns finite losses", () => {
    const sample = syntheticSample({ d0: 0.22, k: 1 }, 400, 7)
    const result = chronologicalValidation(sample, { d0: 0.22, k: 1 })
    assert.equal(result.blocks, 10)
    assert.equal(result.testBlocks, 6)
    // 40 por bloque; el último absorbe el resto (0 acá): 6 bloques de prueba.
    assert.equal(result.testSize, 240)
    for (const key of ["constant", "shape", "configured"]) {
        assert.ok(Number.isFinite(result[key]), key)
        assert.ok(result[key] > 0 && result[key] < RANDOM_LOG_LOSS + 0.5, key)
    }
})

test("chronologicalValidation gives the remainder to the last block and handles tiny samples", () => {
    const sample = syntheticSample({ d0: 0.22, k: 1 }, 405, 11)
    assert.equal(
        chronologicalValidation(sample, { d0: 0.22, k: 1 }).testSize,
        245
    )
    const empty = chronologicalValidation([], { d0: 0.22, k: 1 })
    assert.equal(empty.testSize, 0)
    assert.equal(empty.shape, null)
})

test("calibrationRows counts matches per bucket and compares with the model", () => {
    const params = { d0: 0.2, k: 0 }
    const sample = [
        event(0.55, 1, 1), // 0.5-0.6, empate
        event(0.45, 1, 0), // favorito P2 (.55), gana el otro
        event(0.75, 1, 0), // 0.7-0.8, gana favorito
    ]
    const rows = calibrationRows(sample, params)
    assert.deepEqual(
        rows.map((row) => [row.label, row.n]),
        [
            ["0.5-0.6", 2],
            ["0.7-0.8", 1],
        ]
    )
    assert.equal(rows[0].realDraw, 0.5)
    assert.equal(rows[0].realFavouriteWin, 0)
    assert.ok(Math.abs(rows[0].modelDraw - 0.2) < 1e-12)
    assert.ok(Math.abs(rows[0].modelFavouriteWin - 0.45) < 1e-12)
    assert.equal(rows[1].realFavouriteWin, 1)
    assert.ok(Math.abs(rows[1].meanExpected - 0.75) < 1e-12)
})
