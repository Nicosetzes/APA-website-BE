"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const findRatingMatches = require("../dao/findRatingMatches")
const { defaultDependencies } = require("../service/syncRatingsAfterWrite")

const { RATING_FILTER, RATING_PROJECTION, TOURNAMENT_CONTEXT_PROJECTION } =
    findRatingMatches

// Modelo falso con `find(...).lean()` que registra cada llamada.
const fakeModel = (rows) => {
    const calls = []
    return {
        calls,
        find: (...args) => {
            calls.push(args)
            return { lean: async () => rows }
        },
    }
}

test("la proyección incluye los campos que el motor guarda además del cálculo", () => {
    const paths = RATING_PROJECTION.split(" ")
    for (const path of [
        "teamP1.id",
        "teamP2.id",
        "tournament.id",
        "leg",
        "playedAtPrecision",
        "outcome.penalties",
        "outcome.teamThatWon.id",
        "outcome.scoreFromTeamThatWon",
        "outcome.scoreFromTeamThatLost",
    ]) {
        assert.ok(paths.includes(path), path)
    }
    assert.equal(TOURNAMENT_CONTEXT_PROJECTION, "format playoffMode")
})

test("lee partidos y torneos una sola vez y pide los filtros y proyecciones esperados", async () => {
    const matchesModel = fakeModel([{ _id: "a" }])
    const tournamentsModel = fakeModel([])

    await findRatingMatches({ matchesModel, tournamentsModel })

    assert.equal(matchesModel.calls.length, 1)
    assert.deepEqual(matchesModel.calls[0], [RATING_FILTER, RATING_PROJECTION])
    assert.equal(tournamentsModel.calls.length, 1)
    assert.deepEqual(tournamentsModel.calls[0], [
        {},
        TOURNAMENT_CONTEXT_PROJECTION,
    ])
})

test("las dos lecturas arrancan juntas (Promise.all)", async () => {
    const started = []
    let release
    const gate = new Promise((resolve) => {
        release = resolve
    })
    const slow = (name, rows) => ({
        find: () => {
            started.push(name)
            return {
                lean: async () => {
                    await gate
                    return rows
                },
            }
        },
    })

    const pending = findRatingMatches({
        matchesModel: slow("matches", []),
        tournamentsModel: slow("tournaments", []),
    })
    assert.deepEqual(started, ["matches", "tournaments"])
    release()
    assert.deepEqual(await pending, [])
})

test("adjunta tournamentContext por String(_id) del torneo", async () => {
    const tournamentId = { toString: () => "0123456789abcdef01234567" }
    const matches = [
        { _id: "a", tournament: { id: "0123456789abcdef01234567" } },
        { _id: "b", tournament: { id: "ffffffffffffffffffffffff" } },
        { _id: "c", tournament: {} },
        { _id: "d" },
        { _id: "e", tournament: { id: null } },
    ]
    const tournaments = [
        { _id: tournamentId, format: "playoff", playoffMode: "two_legged" },
        { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", format: "league" },
    ]

    const result = await findRatingMatches({
        matchesModel: fakeModel(matches),
        tournamentsModel: fakeModel(tournaments),
    })

    assert.deepEqual(
        result.map((match) => [match._id, match.tournamentContext]),
        [
            ["a", { format: "playoff", playoffMode: "two_legged" }],
            // Torneo que no existe, sin id o sin tournament: null.
            ["b", null],
            ["c", null],
            ["d", null],
            ["e", null],
        ]
    )
    // El resto del partido queda igual.
    assert.deepEqual(result[0].tournament, matches[0].tournament)
})

test("un torneo sin format o modo de playoff da null en ese campo", async () => {
    const result = await findRatingMatches({
        matchesModel: fakeModel([{ _id: "a", tournament: { id: "t" } }]),
        tournamentsModel: fakeModel([{ _id: "t", format: 3 }]),
    })
    assert.deepEqual(result[0].tournamentContext, {
        format: null,
        playoffMode: null,
    })
})

test("si falla la lectura de torneos rechaza y no sigue sin torneos", async () => {
    const failing = {
        find: () => ({
            lean: async () => {
                throw new Error("tournaments down")
            },
        }),
    }
    await assert.rejects(
        findRatingMatches({
            matchesModel: fakeModel([{ _id: "a" }]),
            tournamentsModel: failing,
        }),
        /tournaments down/
    )
})

test("si falla la lectura de partidos rechaza", async () => {
    const failing = {
        find: () => ({
            lean: async () => {
                throw new Error("matches down")
            },
        }),
    }
    await assert.rejects(
        findRatingMatches({
            matchesModel: failing,
            tournamentsModel: fakeModel([]),
        }),
        /matches down/
    )
})

test("la sincronización al escribir usa esta misma función", () => {
    assert.equal(defaultDependencies.loadMatches, findRatingMatches)
})
