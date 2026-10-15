"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const mongoose = require("mongoose")

const findRatingMatches = require("../dao/findRatingMatches")
const matchesModel = require("../dao/models/matches")
const retrieveRatingsTimeline = require("../service/retrieveRatingsTimeline")
const {
    calculatePlayerRatings,
    snapshotBefore,
} = require("../service/playerRatings")
const { buildRatingsTimeline } = require("../service/playerRatings/timeline")

const NICO = { id: "n", name: "Nico" }
const SANTI = { id: "s", name: "Santi" }
const LEO = { id: "l", name: "Leo" }
const BOCA = { id: 1, name: "Boca" }
const RIVER = { id: 2, name: "River" }

const objectId = (n) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"))

// Partido con la forma completa del documento (incluye campos que el motor no usa).
const fullMatch = (n, playerP1, scoreP1, playerP2, scoreP2, playedAt) => ({
    _id: objectId(n),
    playerP1,
    teamP1: BOCA,
    scoreP1,
    playerP2,
    teamP2: RIVER,
    scoreP2,
    playedAt: new Date(playedAt),
    playedAtPrecision: "exact",
    tournament: { id: "t1", name: "Liga APA", extra: "no usado" },
    type: "regular",
    outcome: { draw: scoreP1 === scoreP2 },
    played: true,
    valid: true,
    group: "A",
    playoff_id: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
})

// Varios partidos comparten la fecha para ejercitar el desempate por _id.
const history = () => [
    fullMatch(1, NICO, 2, SANTI, 0, "2026-01-01T15:00:00Z"),
    fullMatch(2, LEO, 1, NICO, 1, "2026-01-02T15:00:00Z"),
    fullMatch(3, SANTI, 3, LEO, 1, "2026-01-02T15:00:00Z"),
    fullMatch(4, NICO, 0, LEO, 2, "2026-01-02T15:00:00Z"),
    fullMatch(5, SANTI, 1, NICO, 4, "2026-01-05T15:00:00Z"),
]

// El motor sin término de equipo, para no depender de los datos de Sofifa.
const OPTIONS = { teamStrength: null }

// Se queda con los campos que pide `RATING_PROJECTION`, como haría Mongo.
const project = (match) => {
    const projected = { _id: match._id }
    for (const path of findRatingMatches.RATING_PROJECTION.split(" ")) {
        const [field, subfield] = path.split(".")
        if (subfield === undefined) {
            projected[field] = match[field]
        } else {
            projected[field] = {
                ...projected[field],
                [subfield]: match[field][subfield],
            }
        }
    }
    return projected
}

test("findRatingMatches pide solo lo que usa el motor y devuelve objetos planos", async (t) => {
    const original = matchesModel.find
    t.after(() => {
        matchesModel.find = original
    })
    const calls = []
    const plain = [{ _id: "x", scoreP1: 1 }]
    let leanCalled = false
    matchesModel.find = (...args) => {
        calls.push(args)
        return {
            lean() {
                leanCalled = true
                return Promise.resolve(plain)
            },
        }
    }

    const result = await findRatingMatches()

    assert.equal(leanCalled, true)
    assert.equal(result, plain)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0][0], {
        played: { $ne: false },
        valid: { $ne: false },
    })
    assert.deepEqual(calls[0][1].split(" ").sort(), [
        "playedAt",
        "playerP1.id",
        "playerP1.name",
        "playerP2.id",
        "playerP2.name",
        "scoreP1",
        "scoreP2",
        "teamP1.id",
        "teamP1.name",
        "teamP2.id",
        "teamP2.name",
        "tournament.id",
        "tournament.name",
        "type",
    ])
})

test("el motor da los mismos eventos con la proyección liviana que con el documento entero", () => {
    const full = history()
    const light = full.map(project)

    const fromFull = calculatePlayerRatings(full, OPTIONS)
    const fromLight = calculatePlayerRatings(light, OPTIONS)

    assert.equal(fromLight.events.length, 5)
    assert.deepEqual(fromLight.events, fromFull.events)
    assert.deepEqual(fromLight.config, fromFull.config)
})

test("el resultado no depende del orden en que llegan los partidos", () => {
    const ascending = history().map(project)
    const reference = calculatePlayerRatings(ascending, OPTIONS).events

    for (const order of [
        [...ascending].reverse(),
        [ascending[2], ascending[4], ascending[0], ascending[3], ascending[1]],
    ]) {
        assert.deepEqual(
            calculatePlayerRatings(order, OPTIONS).events,
            reference
        )
    }
})

test("el timeline expone lo mismo que el motor y que snapshotBefore", () => {
    const matches = history().map(project)
    const timeline = buildRatingsTimeline(matches, OPTIONS)
    const engine = calculatePlayerRatings(matches, OPTIONS)

    assert.deepEqual(timeline.events, engine.events)
    assert.deepEqual(timeline.config, engine.config)
    assert.equal(timeline.lookup, null)
    assert.deepEqual(
        timeline.snapshotAt(null),
        snapshotBefore(engine.events, null, engine.config.initialRating)
    )

    // Con una fecha de corte solo cuentan los partidos anteriores.
    const cutoff = new Date("2026-01-02T00:00:00Z").getTime()
    const before = timeline.snapshotAt(cutoff)
    assert.equal(before.get("n").matches, 1)
    assert.equal(before.get("s").matches, 1)
    assert.equal(before.has("l"), false)
})

test("el timeline indexa los eventos por id de partido como string", () => {
    const timeline = buildRatingsTimeline(history().map(project), OPTIONS)

    assert.equal(timeline.eventsByMatchId.size, 5)
    const event = timeline.eventsByMatchId.get(String(objectId(1)))
    assert.equal(event.matchId, String(objectId(1)))
    assert.equal(event.p1.id, "n")
})

test("el timeline sin partidos queda vacío y no falla", () => {
    for (const matches of [undefined, null, []]) {
        const timeline = buildRatingsTimeline(matches, OPTIONS)
        assert.deepEqual(timeline.events, [])
        assert.equal(timeline.eventsByMatchId.size, 0)
        assert.equal(timeline.snapshotAt(null).size, 0)
    }
})

test("retrieveRatingsTimeline arma el timeline con el lector inyectado", async () => {
    let reads = 0
    const timeline = await retrieveRatingsTimeline({
        retrieveMatches: async () => {
            reads += 1
            return history().map(project)
        },
        options: OPTIONS,
    })

    assert.equal(reads, 1)
    assert.equal(timeline.events.length, 5)
    assert.equal(typeof timeline.snapshotAt, "function")
})
