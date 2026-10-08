const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetAllTimeTeams } = require("../controller/getAllTimeTeams")
const {
    createGetAllTimeFaceToFace,
} = require("../controller/getAllTimeFaceToFace")

const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    json(body) {
        this.body = body
        return this
    },
    send(body) {
        this.body = body
        return this
    },
})

const NICO = { id: "1", name: "Nico", nickname: "Nico" }
const SANTI = { id: "2", name: "Santi", nickname: "Santi" }
const LEO = { id: "3", name: "Leo", nickname: "Leo" }

const RACING = { id: 10, name: "Racing" }
const BOCA = { id: 20, name: "Boca" }

const LIGA = { id: "t1", name: "Liga" }

const win = (winnerPlayer, winnerTeam, loserPlayer, loserTeam, extra = {}) => ({
    playerP1: winnerPlayer,
    teamP1: winnerTeam,
    scoreP1: 3,
    playerP2: loserPlayer,
    teamP2: loserTeam,
    scoreP2: 1,
    tournament: LIGA,
    outcome: {
        draw: false,
        penalties: false,
        teamThatWon: winnerTeam,
        teamThatLost: loserTeam,
        playerThatWon: winnerPlayer,
        playerThatLost: loserPlayer,
        scoreFromTeamThatWon: 3,
        scoreFromTeamThatLost: 1,
        scoringDifference: 2,
        ...extra,
    },
})

test("all-time teams aggregates points and effectiveness leaderboards", async () => {
    const controller = createGetAllTimeTeams({
        retrieveAllMatches: async () => [
            win(NICO, RACING, SANTI, BOCA),
            win(NICO, RACING, SANTI, BOCA),
        ],
    })
    const response = createResponse()

    await controller({}, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(Object.keys(response.body), [
        "completeStatsByTotalPoints",
        "completeStatsByEffectiveness",
    ])

    const [best] = response.body.completeStatsByTotalPoints
    assert.equal(best.team.name, "Racing")
    assert.equal(best.played, 2)
    assert.equal(best.wins, 2)
    assert.equal(best.points, 6)
    assert.equal(best.effectiveness, 100)

    // El leaderboard de efectividad exige al menos 10 partidos.
    assert.deepEqual(response.body.completeStatsByEffectiveness, [])
})

test("all-time teams requires ten matches for the effectiveness leaderboard", async () => {
    const controller = createGetAllTimeTeams({
        retrieveAllMatches: async () =>
            Array.from({ length: 10 }, () => win(NICO, RACING, SANTI, BOCA)),
    })
    const response = createResponse()

    await controller({}, response)

    const [row] = response.body.completeStatsByEffectiveness
    assert.equal(row.player.name, "Nico")
    assert.equal(row.team.name, "Racing")
    assert.equal(row.played, 10)
    assert.equal(row.effectiveness, 100)
    assert.deepEqual(row.tournament, LIGA)
})

test("all-time teams excludes penalty wins and skips incomplete matches", async () => {
    const controller = createGetAllTimeTeams({
        retrieveAllMatches: async () => [
            win(NICO, RACING, SANTI, BOCA, { penalties: true }),
            { playerP1: NICO, teamP1: RACING, outcome: { draw: true } },
            { outcome: { draw: true } },
        ],
    })
    const response = createResponse()

    await controller({}, response)

    assert.deepEqual(response.body.completeStatsByTotalPoints, [])
    assert.deepEqual(response.body.completeStatsByEffectiveness, [])
})

test("all-time teams propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetAllTimeTeams({
        retrieveAllMatches: async () => {
            throw expectedError
        },
    })

    await assert.rejects(controller({}, createResponse()), expectedError)
})

test("face to face reports one row per pair with mirrored totals", async () => {
    const controller = createGetAllTimeFaceToFace({
        retrieveAllUsers: async () => [NICO, SANTI],
        retrieveAllMatches: async () => [
            { ...win(NICO, RACING, SANTI, BOCA), playedAt: "2026-09-20" },
        ],
    })
    const response = createResponse()

    await controller({}, response)

    assert.equal(response.statusCode, 200)
    assert.equal(response.body.length, 1)

    const [{ p1, p2 }] = response.body
    const nico = p1.id === NICO.id ? p1 : p2
    const santi = p1.id === SANTI.id ? p1 : p2

    assert.equal(nico.played, 1)
    assert.equal(nico.wins, 1)
    assert.equal(nico.losses, 0)
    assert.equal(nico.goalsFor, 3)
    assert.equal(nico.goalsAgainst, 1)
    assert.equal(nico.scoringDifference, 2)
    assert.equal(nico.bestWin.scoreFromTeamThatWon, 3)

    assert.equal(santi.played, 1)
    assert.equal(santi.wins, 0)
    assert.equal(santi.losses, 1)
    assert.equal(santi.goalsFor, 1)
    assert.equal(santi.goalsAgainst, 3)
    assert.equal(santi.scoringDifference, -2)
    assert.equal(santi.bestWin, null)
})

test("face to face does not leak one pair's record into the next", async () => {
    const controller = createGetAllTimeFaceToFace({
        retrieveAllUsers: async () => [NICO, SANTI, LEO],
        // Sólo Nico y Santi jugaron entre sí; los cruces con Leo están vacíos.
        retrieveAllMatches: async () => [
            { ...win(NICO, RACING, SANTI, BOCA), playedAt: "2026-09-20" },
        ],
    })
    const response = createResponse()

    await controller({}, response)

    assert.equal(response.body.length, 3)

    const emptyPairs = response.body.filter(
        ({ p1, p2 }) =>
            [p1.id, p2.id].includes(LEO.id) &&
            [p1.id, p2.id].some((id) => id !== LEO.id)
    )

    assert.equal(emptyPairs.length, 2)

    for (const { p1, p2 } of emptyPairs) {
        for (const side of [p1, p2]) {
            assert.equal(side.played, 0)
            assert.equal(side.wins, 0)
            assert.equal(side.draws, 0)
            assert.equal(side.losses, 0)
            assert.equal(side.goalsFor, 0)
            assert.equal(side.goalsAgainst, 0)
            assert.equal(side.scoringDifference, 0)
            assert.equal(side.bestWin, null)
        }
    }
})

test("face to face counts draws for both sides", async () => {
    const controller = createGetAllTimeFaceToFace({
        retrieveAllUsers: async () => [NICO, SANTI],
        retrieveAllMatches: async () => [
            {
                playerP1: NICO,
                teamP1: RACING,
                scoreP1: 2,
                playerP2: SANTI,
                teamP2: BOCA,
                scoreP2: 2,
                tournament: LIGA,
                outcome: { draw: true },
                playedAt: "2026-09-20",
            },
        ],
    })
    const response = createResponse()

    await controller({}, response)

    const [{ p1, p2 }] = response.body

    assert.equal(p1.draws, 1)
    assert.equal(p2.draws, 1)
    assert.equal(p1.played, 1)
    assert.equal(p2.played, 1)
    assert.equal(p1.bestWin, null)
    assert.equal(p2.bestWin, null)
})

test("face to face propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetAllTimeFaceToFace({
        retrieveAllUsers: async () => {
            throw expectedError
        },
    })

    await assert.rejects(controller({}, createResponse()), expectedError)
})

test("face to face picks the highest score and ties by playedAt", async () => {
    const santiWin = (extra, match = {}) => ({
        ...win(SANTI, BOCA, NICO, RACING, { scoringDifference: 2, ...extra }),
        ...match,
    })
    const controller = createGetAllTimeFaceToFace({
        retrieveAllUsers: async () => [NICO, SANTI],
        retrieveAllMatches: async () => [
            santiWin(
                { scoreFromTeamThatWon: 9, marker: "nine" },
                { playedAt: "2018-01-01T00:00:00.000Z" }
            ),
            santiWin(
                { scoreFromTeamThatWon: 12, marker: "twelve" },
                { playedAt: "2026-12-01T00:00:00.000Z" }
            ),
            // Mismo marcador: gana el jugado antes, aunque se editó después.
            santiWin(
                { scoreFromTeamThatWon: 12, marker: "older" },
                {
                    playedAt: "2019-05-01T00:00:00.000Z",
                    updatedAt: "2026-10-01T00:00:00.000Z",
                }
            ),
            santiWin(
                { scoreFromTeamThatWon: 12, marker: "newer" },
                {
                    playedAt: "2026-01-01T00:00:00.000Z",
                    // updatedAt más viejo no cuenta.
                    updatedAt: "2010-01-01T00:00:00.000Z",
                }
            ),
        ],
    })
    const response = createResponse()

    await controller({}, response)

    const [{ p1, p2 }] = response.body
    const santi = p1.id === SANTI.id ? p1 : p2
    assert.equal(santi.wins, 4)
    assert.equal(santi.bestWin.marker, "older")
})

test("all-time teams groups every match of a team under its numeric id", async () => {
    // Mismo id en otro objeto: sigue siendo un solo equipo.
    const racingCopy = { id: 10, name: "Racing" }
    const bocaCopy = { id: 20, name: "Boca" }
    const controller = createGetAllTimeTeams({
        retrieveAllMatches: async () => [
            win(NICO, RACING, SANTI, BOCA),
            win(NICO, racingCopy, SANTI, bocaCopy),
            ...Array.from({ length: 5 }, () => win(NICO, RACING, SANTI, BOCA)),
            ...Array.from({ length: 5 }, () =>
                win(NICO, racingCopy, SANTI, bocaCopy)
            ),
        ],
    })
    const response = createResponse()

    await controller({}, response)

    const racing = response.body.completeStatsByTotalPoints.filter(
        ({ team }) => team.name === "Racing"
    )
    assert.equal(racing.length, 1)
    assert.equal(racing[0].wins, 12)
    const boca = response.body.completeStatsByTotalPoints.filter(
        ({ team }) => team.name === "Boca"
    )
    assert.equal(boca.length, 1)
    assert.equal(boca[0].losses, 12)

    // El ranking por torneo tampoco parte al equipo en dos.
    const effectiveness = response.body.completeStatsByEffectiveness.filter(
        ({ team }) => team.name === "Racing"
    )
    assert.equal(effectiveness.length, 1)
    assert.equal(effectiveness[0].played, 12)
})

test("matches without tournament count globally but not per tournament", async () => {
    const friendly = (extra = {}) => ({
        ...win(NICO, RACING, SANTI, BOCA),
        tournament: null,
        ...extra,
    })
    const controller = createGetAllTimeTeams({
        retrieveAllMatches: async () => [
            ...Array.from({ length: 10 }, () => friendly()),
            friendly({
                scoreP1: 1,
                scoreP2: 1,
                outcome: { draw: true, penalties: false },
            }),
        ],
    })
    const response = createResponse()

    await controller({}, response)

    const [racing] = response.body.completeStatsByTotalPoints
    assert.equal(racing.team.name, "Racing")
    assert.equal(racing.wins, 10)
    assert.equal(racing.draws, 1)
    assert.deepEqual(response.body.completeStatsByEffectiveness, [])
})
