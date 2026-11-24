const assert = require("node:assert/strict")
const test = require("node:test")

const { toTournamentReference } = require("../utils/tournamentReference")
const { buildLegsForTie } = require("../service/playoffSeries")

test("la referencia lleva id, name y la edición del juego del torneo", () => {
    assert.deepEqual(
        toTournamentReference({
            id: "t1",
            name: "Liga",
            gameVersion: "FC 27",
            format: "league",
            players: [],
        }),
        { id: "t1", name: "Liga", gameVersion: "FC 27" }
    )
})

test("sin edición la referencia queda como antes: solo id y name", () => {
    for (const gameVersion of [undefined, null, "", "   ", 27]) {
        assert.deepEqual(
            toTournamentReference({ id: "t1", name: "Liga", gameVersion }),
            { id: "t1", name: "Liga" },
            String(gameVersion)
        )
    }
})

test("acepta un id explícito y recorta la edición", () => {
    assert.deepEqual(
        toTournamentReference(
            { _id: "abc", name: "Copa", gameVersion: " FC 26 " },
            { id: "abc" }
        ),
        { id: "abc", name: "Copa", gameVersion: "FC 26" }
    )
})

test("los cruces de playoff copian la edición del torneo en cada partido", () => {
    const legs = buildLegsForTie({
        tournament: {
            _id: "507f1f77bcf86cd799439011",
            name: "Copa",
            playoffMode: "two_legged",
            gameVersion: "FC 27",
        },
        playoffId: 1,
        unitA: null,
        unitB: null,
    })
    assert.ok(legs.length >= 1)
    for (const leg of legs) {
        assert.deepEqual(leg.tournament, {
            id: "507f1f77bcf86cd799439011",
            name: "Copa",
            gameVersion: "FC 27",
        })
    }
})
