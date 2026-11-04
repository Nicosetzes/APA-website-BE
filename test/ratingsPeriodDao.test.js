"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const dao = require("../dao")
const findRatingBoundaryEvents = require("../dao/findRatingBoundaryEvents")
const findRatingEventsInRange = require("../dao/findRatingEventsInRange")
const {
    fakeBoundaryModel,
    fakeRangeModel,
    projectDoc,
    runPipeline,
} = require("./fixtures/ratingsPeriod")
const {
    storedDocsFrom,
    syntheticHistory,
} = require("./fixtures/ratingsReadModel")

const { buildBoundaryPipeline } = findRatingBoundaryEvents
const { RATING_EVENTS_RANGE_PROJECTION } = findRatingEventsInRange

const VERSION = "2.0"
const START = new Date("2026-01-05T03:00:00Z")
const END = new Date("2026-01-10T03:00:00Z")

// ---------------------------------------------------------------------------
// Consulta A: findRatingEventsInRange
// ---------------------------------------------------------------------------

test("findRatingEventsInRange: filtro [start, end), proyección, orden por seq y .lean()", async () => {
    const calls = []
    const model = {
        find: (...args) => {
            calls.push({ find: args })
            return {
                sort: (spec) => {
                    calls.push({ sort: spec })
                    return {
                        lean: async () => {
                            calls.push({ lean: true })
                            return [{ seq: 1 }]
                        },
                    }
                },
            }
        },
    }

    const result = await findRatingEventsInRange(VERSION, START, END, { model })

    assert.deepEqual(result, [{ seq: 1 }])
    assert.deepEqual(calls[0].find[0], {
        ratingVersion: VERSION,
        time: { $gte: START, $lt: END },
    })
    assert.equal(calls[0].find[1], RATING_EVENTS_RANGE_PROJECTION)
    assert.deepEqual(calls[1], { sort: { seq: 1 } })
    assert.deepEqual(calls[2], { lean: true })
})

test("findRatingEventsInRange: la proyección trae lo mínimo y deja afuera lo demás", () => {
    const fields = RATING_EVENTS_RANGE_PROJECTION.split(" ")
    for (const field of [
        "seq",
        "time",
        "matchId",
        "tournament",
        "type",
        "scoreP1",
        "scoreP2",
        "expectedP1",
        "resultP1",
        "delta",
        "p1.id",
        "p1.name",
        "p1.before",
        "p1.games",
        "p2.id",
        "p2.name",
        "p2.before",
        "p2.games",
        "fingerprint",
        "-_id",
    ]) {
        assert.ok(fields.includes(field), field)
    }
    for (const field of [
        "after",
        "team",
        "teamOverall",
        "teamAdjustment",
        "computedAt",
        "ratingVersion",
    ]) {
        assert.ok(
            !fields.some(
                (name) => name === field || name.endsWith(`.${field}`)
            ),
            field
        )
    }
})

test("findRatingEventsInRange: lanza con versión, fechas o rango inválidos", async () => {
    const model = {
        find: () => assert.fail("no debe consultar la base"),
    }
    for (const version of ["", "  ", undefined, null, 2]) {
        await assert.rejects(
            findRatingEventsInRange(version, START, END, { model }),
            /ratingVersion/
        )
    }
    for (const [start, end] of [
        [new Date("x"), END],
        [START, new Date("x")],
        ["2026-01-05", END],
        [START, null],
        [undefined, undefined],
    ]) {
        await assert.rejects(
            findRatingEventsInRange(VERSION, start, end, { model }),
            /Date válidas/
        )
    }
    await assert.rejects(
        findRatingEventsInRange(VERSION, END, START, { model }),
        /start tiene que ser < end/
    )
    await assert.rejects(
        findRatingEventsInRange(VERSION, START, START, { model }),
        /start tiene que ser < end/
    )
})

test("findRatingEventsInRange: sobre los eventos del motor devuelve solo [start, end) en orden de seq", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    const rows = await findRatingEventsInRange(VERSION, START, END, {
        model: fakeRangeModel(docs),
    })

    const expected = docs.events
        .filter((event) => event.time >= START && event.time < END)
        .map((event) => event.seq)
    assert.ok(expected.length > 0)
    assert.deepEqual(
        rows.map((row) => row.seq),
        expected
    )
    // Solo lo proyectado.
    for (const row of rows) {
        assert.equal(row.after, undefined)
        assert.equal(row.computedAt, undefined)
        assert.equal(row.ratingVersion, undefined)
        assert.equal(row.p1.after, undefined)
        assert.equal(row.p1.team, undefined)
        assert.equal(typeof row.p1.before, "number")
        assert.equal(typeof row.p1.games, "number")
    }
})

test("findRatingEventsInRange: time === start entra y time === end no; time nulo nunca entra", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    const event = docs.events[4]
    const edited = {
        events: docs.events.map((item, index) => ({
            ...item,
            time:
                index === 4
                    ? new Date(START)
                    : index === 5
                    ? new Date(END)
                    : index === 6
                    ? null
                    : item.time,
        })),
    }

    const rows = await findRatingEventsInRange(VERSION, START, END, {
        model: fakeRangeModel(edited),
    })

    const seqs = rows.map((row) => row.seq)
    assert.ok(seqs.includes(event.seq))
    assert.ok(!seqs.includes(docs.events[5].seq))
    assert.ok(!seqs.includes(docs.events[6].seq))
})

// ---------------------------------------------------------------------------
// Consulta B: findRatingBoundaryEvents
// ---------------------------------------------------------------------------

test("findRatingBoundaryEvents: aggregate con el $match exacto y la respuesta tal cual", async () => {
    const calls = []
    const model = {
        aggregate: async (pipeline) => {
            calls.push(pipeline)
            return [{ id: "a" }]
        },
    }

    const result = await findRatingBoundaryEvents(VERSION, END, { model })

    assert.deepEqual(result, [{ id: "a" }])
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0][0], {
        $match: { ratingVersion: VERSION, time: { $gte: END } },
    })
    assert.deepEqual(calls[0], buildBoundaryPipeline(VERSION, END))
})

test("buildBoundaryPipeline: ordena por seq antes de $unwind y $group, agrupa por jugador y no limita", () => {
    const pipeline = buildBoundaryPipeline(VERSION, END)
    const names = pipeline.map((stage) => Object.keys(stage)[0])

    assert.ok(names.indexOf("$sort") < names.indexOf("$unwind"))
    assert.ok(names.indexOf("$unwind") < names.indexOf("$group"))
    assert.ok(!names.includes("$limit"))
    assert.equal(names[0], "$match")

    const group = pipeline.find((stage) => stage.$group).$group
    assert.equal(group._id, "$sides.id")
    assert.ok(group.first.$first)
    assert.ok(group.last.$last)
    assert.deepEqual(group.count, { $sum: 1 })
    assert.deepEqual(group.fingerprints, { $addToSet: "$fingerprint" })
    // El orden previo al $group es por seq.
    assert.deepEqual(pipeline.find((stage) => stage.$sort).$sort, { seq: 1 })
})

test("findRatingBoundaryEvents: lanza con versión o end inválidos y si la respuesta no es un arreglo", async () => {
    const model = {
        aggregate: async () => assert.fail("no debe consultar la base"),
    }
    for (const version of ["", " ", undefined, null, 2]) {
        await assert.rejects(
            findRatingBoundaryEvents(version, END, { model }),
            /ratingVersion/
        )
    }
    for (const end of [undefined, null, "2026-01-10", new Date("x")]) {
        await assert.rejects(
            findRatingBoundaryEvents(VERSION, end, { model }),
            /end tiene que ser una Date/
        )
    }
    await assert.rejects(
        findRatingBoundaryEvents(VERSION, END, {
            model: { aggregate: async () => ({}) },
        }),
        /respuesta inválida/
    )
})

test("findRatingBoundaryEvents: una fila por jugador con primer y último evento posteriores a end", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    const rows = await findRatingBoundaryEvents(VERSION, END, {
        model: fakeBoundaryModel(docs),
    })

    const after = docs.events.filter((event) => event.time >= END)
    const sides = (event) => [
        { side: event.p1, sign: 1 },
        { side: event.p2, sign: -1 },
    ]
    const ids = [
        ...new Set(
            after.flatMap((event) => sides(event).map((s) => s.side.id))
        ),
    ].sort()

    assert.deepEqual(
        rows.map((row) => row.id),
        ids
    )
    for (const row of rows) {
        const mine = after.filter((event) =>
            sides(event).some(({ side }) => side.id === row.id)
        )
        const sideOf = (event) =>
            sides(event).find(({ side }) => side.id === row.id)
        const first = mine[0]
        const last = mine[mine.length - 1]

        assert.equal(row.count, mine.length)
        assert.deepEqual(row.fingerprints, [first.fingerprint])
        assert.deepEqual(row.first, {
            seq: first.seq,
            name: sideOf(first).side.name,
            before: sideOf(first).side.before,
            games: sideOf(first).side.games,
        })
        assert.deepEqual(row.last, {
            seq: last.seq,
            before: sideOf(last).side.before,
            games: sideOf(last).side.games,
            delta: last.delta,
            sign: sideOf(last).sign,
        })
        assert.deepEqual(Object.keys(row).sort(), [
            "count",
            "fingerprints",
            "first",
            "id",
            "last",
        ])
    }
    // Hay jugadores que fueron p1 y otros p2 en su último evento.
    assert.ok(rows.some((row) => row.last.sign === 1))
    assert.ok(rows.some((row) => row.last.sign === -1))
})

test("findRatingBoundaryEvents: end posterior al último evento devuelve []; time === end entra; time nulo no", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    const lastTime = docs.events[docs.events.length - 1].time

    assert.deepEqual(
        await findRatingBoundaryEvents(
            VERSION,
            new Date(lastTime.getTime() + 1),
            {
                model: fakeBoundaryModel(docs),
            }
        ),
        []
    )

    const exact = await findRatingBoundaryEvents(VERSION, lastTime, {
        model: fakeBoundaryModel(docs),
    })
    const lastEvent = docs.events[docs.events.length - 1]
    assert.deepEqual(
        exact.map((row) => row.id).sort(),
        [lastEvent.p1.id, lastEvent.p2.id].sort()
    )

    const withNulls = {
        events: docs.events.map((event) => ({ ...event, time: null })),
    }
    assert.deepEqual(
        await findRatingBoundaryEvents(VERSION, new Date(0), {
            model: fakeBoundaryModel(withNulls),
        }),
        []
    )
})

test("findRatingBoundaryEvents: ignora los eventos de otra versión", async () => {
    const docs = storedDocsFrom(syntheticHistory())
    const other = {
        events: docs.events.map((event) => ({
            ...event,
            ratingVersion: "9.9",
        })),
    }

    assert.deepEqual(
        await findRatingBoundaryEvents(VERSION, new Date(0), {
            model: fakeBoundaryModel(other),
        }),
        []
    )
})

// ---------------------------------------------------------------------------
// Intérprete de pipelines (sanidad del fake) y exports
// ---------------------------------------------------------------------------

test("runPipeline: pipelines chicos con resultado conocido", () => {
    const docs = [
        { k: "x", n: 3, v: 1 },
        { k: "y", n: 1, v: 2 },
        { k: "x", n: 2, v: 3 },
    ]

    assert.deepEqual(
        runPipeline(docs, [
            { $sort: { n: 1 } },
            {
                $group: {
                    _id: "$k",
                    count: { $sum: 1 },
                    first: { $first: { v: "$v" } },
                    last: { $last: { v: "$v" } },
                    all: { $addToSet: "$k" },
                },
            },
            {
                $project: {
                    _id: 0,
                    id: "$_id",
                    count: 1,
                    first: 1,
                    last: 1,
                    all: 1,
                },
            },
            { $sort: { id: 1 } },
        ]),
        [
            {
                id: "x",
                count: 2,
                first: { v: 3 },
                last: { v: 1 },
                all: ["x"],
            },
            { id: "y", count: 1, first: { v: 2 }, last: { v: 2 }, all: ["y"] },
        ]
    )
    assert.deepEqual(
        runPipeline([{ a: [{ z: 1 }, { z: 2 }] }], [{ $unwind: "$a" }]),
        [{ a: { z: 1 } }, { a: { z: 2 } }]
    )
    assert.deepEqual(
        runPipeline(docs, [
            { $match: { n: { $gte: 2 } } },
            { $project: { n: 1, c: { $literal: 7 } } },
        ]),
        [
            { n: 3, c: 7 },
            { n: 2, c: 7 },
        ]
    )
})

test("runPipeline: lanza ante cualquier operador o etapa que no soporta", () => {
    assert.throws(() => runPipeline([{}], [{ $limit: 1 }]), /no soporta/)
    assert.throws(
        () => runPipeline([{ a: 1 }], [{ $project: { b: { $add: [1, 2] } } }]),
        /no soporta/
    )
    assert.throws(
        () => runPipeline([{ a: 1 }], [{ $match: { a: { $in: [1] } } }]),
        /no soporta/
    )
    assert.throws(
        () =>
            runPipeline(
                [{ a: 1 }],
                [{ $group: { _id: "$a", s: { $max: "$a" } } }]
            ),
        /no soporta/
    )
})

test("projectDoc: aplica inclusiones con paths anidados y excluye -_id", () => {
    assert.deepEqual(
        projectDoc(
            { _id: 1, a: 1, b: { c: 2, d: 3 }, e: 4 },
            "a b.c missing -_id"
        ),
        { a: 1, b: { c: 2 } }
    )
})

test("dao/index.js exporta los dos DAOs del período", () => {
    assert.equal(dao.findRatingEventsInRange, findRatingEventsInRange)
    assert.equal(dao.findRatingBoundaryEvents, findRatingBoundaryEvents)
})
