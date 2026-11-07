"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    eventKind,
    eventProbability,
} = require("../service/playerRatings/eventProbability")
const { outcomeProbabilities } = require("../service/playerRatings/outcomes")
const {
    buildPredictionIndex,
    predictMatch,
    predictOutcomes,
    predictionKind,
} = require("../service/playerRatings/prediction")
const { LEO, NICO, SANTI, match } = require("./fixtures/ratingsStore")

const tournament = (format, playoffMode) => ({ format, playoffMode })

test("eventKind: un partido regular es de victoria, con o sin torneo", () => {
    assert.equal(eventKind({ type: "regular", tournament: null }), "win")
    assert.equal(
        eventKind({
            type: "regular",
            tournament: tournament("champions_league"),
        }),
        "win"
    )
})

test("eventKind: playoff y play-in de partido único son de avanzar", () => {
    for (const format of [
        "world_cup",
        "world_cup_2026",
        "league_playin_playoff",
        "american_cup",
        "playoff",
    ]) {
        for (const type of ["playoff", "playin"]) {
            assert.equal(
                eventKind({ type, tournament: tournament(format, "single") }),
                "advance",
                `${format} ${type}`
            )
        }
    }
})

test("eventKind: Champions playoff es de victoria y su play-in no tiene clasificación", () => {
    const champions = tournament("champions_league")
    assert.equal(eventKind({ type: "playoff", tournament: champions }), "win")
    assert.equal(eventKind({ type: "playin", tournament: champions }), null)
})

test("eventKind: cruce a dos piernas, patas 1 y 2 son de victoria y la 3 no tiene clasificación", () => {
    const twoLegged = tournament("playoff", "two_legged")
    assert.equal(
        eventKind({ type: "playoff", leg: 1, tournament: twoLegged }),
        "win"
    )
    assert.equal(
        eventKind({ type: "playoff", leg: 2, tournament: twoLegged }),
        "win"
    )
    assert.equal(
        eventKind({ type: "playoff", leg: 3, tournament: twoLegged }),
        null
    )
    assert.equal(
        eventKind({ type: "playoff", leg: undefined, tournament: twoLegged }),
        null
    )
})

test("eventKind: sin torneo o con type desconocido no se inventa un tipo", () => {
    assert.equal(eventKind({ type: "playoff", tournament: null }), null)
    assert.equal(eventKind({ type: "playin", tournament: undefined }), null)
    assert.equal(
        eventKind({ type: null, tournament: tournament("playoff") }),
        null
    )
    assert.equal(
        eventKind({ type: undefined, tournament: tournament("playoff") }),
        null
    )
    assert.equal(
        eventKind({ type: "otro", tournament: tournament("playoff") }),
        null
    )
})

test("eventProbability win: usa outcomeProbabilities, invierte el P2 y no incluye el empate", () => {
    const expectedP1 = 0.3123456
    const odds = outcomeProbabilities(expectedP1)

    assert.deepEqual(
        eventProbability({ kind: "win", expectedP1, isP1: true }),
        {
            kind: "win",
            for: odds.p1Win,
            against: odds.p2Win,
        }
    )
    assert.deepEqual(
        eventProbability({ kind: "win", expectedP1, isP1: false }),
        { kind: "win", for: odds.p2Win, against: odds.p1Win }
    )
    const home = eventProbability({ kind: "win", expectedP1, isP1: true })
    assert.ok(home.for + home.against < 1)
    assert.ok(Math.abs(home.for + home.against + odds.draw - 1) < 1e-9)
})

test("eventProbability advance: for + against = 1 y el P2 se invierte", () => {
    const home = eventProbability({
        kind: "advance",
        expectedP1: 0.27349,
        isP1: true,
    })
    const away = eventProbability({
        kind: "advance",
        expectedP1: 0.27349,
        isP1: false,
    })

    assert.deepEqual(home, { kind: "advance", for: 0.273, against: 0.727 })
    assert.deepEqual(away, { kind: "advance", for: 0.727, against: 0.273 })
    assert.equal(home.for + home.against, 1)
})

test("eventProbability: kind nulo o expectedP1 inválido devuelve null", () => {
    assert.equal(
        eventProbability({ kind: null, expectedP1: 0.4, isP1: true }),
        null
    )
    for (const expectedP1 of [NaN, undefined, null, -0.1, 1.2, "0.4"]) {
        for (const kind of ["win", "advance"]) {
            assert.equal(
                eventProbability({ kind, expectedP1, isP1: true }),
                null,
                `${kind} ${expectedP1}`
            )
        }
    }
})

test("paridad: coincide exactamente con predictOutcomes y predictMatch de un partido jugado", () => {
    const matches = [
        match(1, NICO, 2, SANTI, 0, "2026-01-01T15:00:00Z"),
        match(2, LEO, 1, NICO, 1, "2026-01-02T15:00:00Z"),
        match(3, SANTI, 3, LEO, 1, "2026-01-03T15:00:00Z"),
        match(4, NICO, 0, LEO, 2, "2026-01-04T15:00:00Z"),
        match(5, SANTI, 1, NICO, 4, "2026-01-05T15:00:00Z", {
            type: "playoff",
        }),
    ]
    const index = buildPredictionIndex(matches, { teamStrength: null })
    const single = tournament("world_cup", "single")

    for (const played of matches) {
        const event = index.eventsByMatchId.get(String(played._id))
        const kind = eventKind({
            type: played.type,
            leg: played.leg,
            tournament: single,
        })
        assert.equal(
            kind === "win" ? "outcomes" : "advance",
            predictionKind({ match: played, tournament: single })
        )

        if (kind === "win") {
            const expected = predictOutcomes(played, index)
            assert.deepEqual(
                eventProbability({
                    kind,
                    expectedP1: event.expectedP1,
                    isP1: true,
                }),
                { kind, for: expected.p1Win, against: expected.p2Win }
            )
            assert.deepEqual(
                eventProbability({
                    kind,
                    expectedP1: event.expectedP1,
                    isP1: false,
                }),
                { kind, for: expected.p2Win, against: expected.p1Win }
            )
        } else {
            const expected = predictMatch(played, index)
            assert.deepEqual(
                eventProbability({
                    kind,
                    expectedP1: event.expectedP1,
                    isP1: true,
                }),
                { kind, for: expected.p1, against: expected.p2 }
            )
            assert.deepEqual(
                eventProbability({
                    kind,
                    expectedP1: event.expectedP1,
                    isP1: false,
                }),
                { kind, for: expected.p2, against: expected.p1 }
            )
        }
    }
})
