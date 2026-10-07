const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const updateMatchResult = require("../dao/updateMatchResult")
const updateTournamentOutcome = require("../dao/updateTournamentOutcome")
const findTournamentById = require("../dao/findTournamentById")
const findPlayoffMatchesByTournamentId = require("../dao/findPlayoffMatchesByTournamentId")
const updatePlayoffMatchTeams = require("../dao/updatePlayoffMatchTeams")
const generatePlayoffUpdate = require("../service/generatePlayoffUpdate")

const createQuery = (result) => ({
    receivedSession: null,
    receivedSort: null,
    session(session) {
        this.receivedSession = session
        return this
    },
    sort(sort) {
        this.receivedSort = sort
        return this
    },
    then(resolve, reject) {
        return Promise.resolve(result).then(resolve, reject)
    },
})

test("match and tournament updates preserve new:true and receive session", async (t) => {
    const originalMatchUpdate = matchesModel.findByIdAndUpdate
    const originalTournamentUpdate = tournamentsModel.findByIdAndUpdate
    const session = { id: "session" }
    const calls = []

    t.after(() => {
        matchesModel.findByIdAndUpdate = originalMatchUpdate
        tournamentsModel.findByIdAndUpdate = originalTournamentUpdate
    })

    matchesModel.findByIdAndUpdate = async (...args) => {
        calls.push(["match", ...args])
        return { _id: args[0] }
    }
    tournamentsModel.findByIdAndUpdate = async (...args) => {
        calls.push(["tournament", ...args])
        return { _id: args[0] }
    }

    await updateMatchResult("match", 2, 1, { draw: false }, true, {
        session,
    })
    await updateTournamentOutcome("tournament", {}, {}, { session })

    assert.equal(calls[0][3].session, session)
    assert.equal(calls[0][3].new, true)
    assert.equal(calls[1][3].session, session)
    assert.equal(calls[1][3].new, true)
})

test("tournament outcome sets closedAt from the closure or now", async (t) => {
    const originalTournamentUpdate = tournamentsModel.findByIdAndUpdate
    const updates = []

    t.after(() => {
        tournamentsModel.findByIdAndUpdate = originalTournamentUpdate
    })

    tournamentsModel.findByIdAndUpdate = async (id, update) => {
        updates.push(update)
        return { _id: id }
    }

    const closedAt = new Date("2022-03-15T00:00:00.000Z")
    await updateTournamentOutcome(
        "tournament",
        { team: { id: 1 } },
        { team: { id: 2 } },
        {},
        { closedAt, closedAtPrecision: "month" }
    )
    const before = Date.now()
    await updateTournamentOutcome("tournament", {}, {})

    assert.equal(updates[0].ongoing, false)
    assert.equal(updates[0].closedAt, closedAt)
    assert.equal(updates[0].closedAtPrecision, "month")
    assert.ok(updates[1].closedAt instanceof Date)
    assert.ok(updates[1].closedAt.getTime() >= before)
    assert.equal(updates[1].closedAtPrecision, "exact")
})

test("legacy result update resolves playedAt from the previous match", async (t) => {
    const originalMatchUpdate = matchesModel.findByIdAndUpdate
    const calls = []
    const session = { id: "session" }
    const playedAt = new Date("2022-11-30T21:00:00.000Z")
    const updatedAt = new Date("2023-05-10T12:00:00.000Z")

    t.after(() => {
        matchesModel.findByIdAndUpdate = originalMatchUpdate
    })

    matchesModel.findByIdAndUpdate = async (...args) => {
        calls.push(args)
        return { _id: args[0] }
    }

    const before = Date.now()
    await updateMatchResult("first", 2, 1, { draw: false }, true, {
        session,
        previous: { _id: "first", played: false, updatedAt },
    })
    const after = Date.now()
    await updateMatchResult("edited", 3, 1, { draw: false }, true, {
        session,
        previous: {
            _id: "edited",
            played: true,
            playedAt,
            playedAtPrecision: "day",
            updatedAt,
        },
    })
    await updateMatchResult("backlog", 0, 0, { draw: true }, true, {
        session,
        previous: { _id: "backlog", played: true, updatedAt },
    })

    // Primera carga: ahora, exacto.
    const [, firstUpdate, firstOptions] = calls[0]
    assert.ok(firstUpdate.playedAt instanceof Date)
    assert.ok(firstUpdate.playedAt.getTime() >= before)
    assert.ok(firstUpdate.playedAt.getTime() <= after)
    assert.equal(firstUpdate.playedAtPrecision, "exact")
    // `previous` no llega a Mongoose.
    assert.deepEqual(firstOptions, { session, new: true })

    // Editar un partido con playedAt no lo mueve.
    assert.equal("playedAt" in calls[1][1], false)
    assert.equal("playedAtPrecision" in calls[1][1], false)

    // Jugado antes del backfill: conserva su updatedAt previo.
    assert.equal(calls[2][1].playedAt, updatedAt)
    assert.equal(calls[2][1].playedAtPrecision, "exact")
})

test("transactional reads attach session without changing query semantics", async (t) => {
    const originalFindById = tournamentsModel.findById
    const originalFind = matchesModel.find
    const session = { id: "session" }
    const tournamentQuery = createQuery({ _id: "tournament" })
    const matchesQuery = createQuery([])

    t.after(() => {
        tournamentsModel.findById = originalFindById
        matchesModel.find = originalFind
    })

    tournamentsModel.findById = () => tournamentQuery
    matchesModel.find = () => matchesQuery

    await findTournamentById("tournament", { session })
    await findPlayoffMatchesByTournamentId("tournament", { session })

    assert.equal(tournamentQuery.receivedSession, session)
    assert.equal(matchesQuery.receivedSession, session)
    assert.deepEqual(matchesQuery.receivedSort, {
        playoff_id: 1,
        leg: 1,
        _id: 1,
    })
})

test("playoff destination updates receive session", async (t) => {
    const originalFindOneAndUpdate = matchesModel.findOneAndUpdate
    const session = { id: "session" }
    let received

    t.after(() => {
        matchesModel.findOneAndUpdate = originalFindOneAndUpdate
    })

    matchesModel.findOneAndUpdate = async (...args) => {
        received = args
        return { _id: "destination" }
    }

    await updatePlayoffMatchTeams(
        "tournament",
        5,
        { playerP1: { id: "player" } },
        { session }
    )

    assert.equal(received[2].session, session)
    assert.equal(received[2].new, true)
    assert.equal(received[2].timestamps, false)
})

test("playoff generation propagates one session to creates and serial updates", async (t) => {
    const originalInsertMany = matchesModel.insertMany
    const originalFindOneAndUpdate = matchesModel.findOneAndUpdate
    const session = { id: "session" }
    const operations = []
    const winner = {
        playerThatWon: { id: "player" },
        teamThatWon: { id: "team" },
        seedFromTeamThatWon: "seed",
    }
    const matches = [
        { playoff_id: 1, played: true, outcome: winner },
        { playoff_id: 2, played: true, outcome: winner },
        { playoff_id: 3, played: true, outcome: winner },
        { playoff_id: 4, played: false },
        { playoff_id: 6, played: false, playerP1: null, playerP2: null },
    ]

    t.after(() => {
        matchesModel.insertMany = originalInsertMany
        matchesModel.findOneAndUpdate = originalFindOneAndUpdate
    })

    matchesModel.insertMany = async (documents, options) => {
        operations.push(["create", options.session])
        return documents
    }
    matchesModel.findOneAndUpdate = async (filter, update, options) => {
        operations.push(["update", options.session])
        return { filter, update }
    }

    const result = await generatePlayoffUpdate(
        { id: "tournament", name: "Tournament" },
        matches,
        8,
        { session }
    )

    assert.deepEqual(operations, [
        ["create", session],
        ["update", session],
    ])
    assert.equal(result.created.length, 1)
    assert.equal(result.updated.length, 1)
})

test("filling a side of an already played playoff destination recomputes its outcome", async (t) => {
    const originalInsertMany = matchesModel.insertMany
    const originalFindOneAndUpdate = matchesModel.findOneAndUpdate
    const updates = []
    const winnerOf = (n) => ({
        playerThatWon: { id: `player-${n}`, name: `Player ${n}` },
        teamThatWon: { id: n * 10, name: `Team ${n}` },
        seedFromTeamThatWon: String(n),
    })
    const matches = [
        { playoff_id: 1, played: true, outcome: winnerOf(1) },
        { playoff_id: 2, played: false },
        { playoff_id: 3, played: false },
        { playoff_id: 4, played: false },
        {
            playoff_id: 5,
            played: true,
            playerP1: null,
            teamP1: null,
            seedP1: null,
            scoreP1: 0,
            playerP2: { id: "player-2", name: "Player 2" },
            teamP2: { id: 20, name: "Team 2" },
            seedP2: "2",
            scoreP2: 3,
            outcome: {
                playerThatWon: { id: "player-2", name: "Player 2" },
                teamThatWon: { id: 20, name: "Team 2" },
                seedFromTeamThatWon: "2",
                scoreFromTeamThatWon: 3,
                playerThatLost: null,
                teamThatLost: { id: 999, name: "Stale team" },
                seedFromTeamThatLost: null,
                scoreFromTeamThatLost: 0,
                draw: false,
                scoringDifference: 3,
            },
        },
    ]

    t.after(() => {
        matchesModel.insertMany = originalInsertMany
        matchesModel.findOneAndUpdate = originalFindOneAndUpdate
    })

    matchesModel.insertMany = async (documents) => documents
    matchesModel.findOneAndUpdate = async (filter, update, options) => {
        updates.push({ filter, update, options })
        return { filter, update }
    }

    await generatePlayoffUpdate(
        { id: "tournament", name: "Tournament" },
        matches,
        8
    )

    const [{ update, options }] = updates
    assert.equal(update.$set.teamP1.id, 10)
    assert.equal(update.$set.outcome.teamThatLost.id, 10)
    assert.equal(update.$set.outcome.playerThatLost.id, "player-1")
    assert.equal(update.$set.outcome.seedFromTeamThatLost, "1")
    assert.equal(update.$set.outcome.teamThatWon.id, 20)
    assert.equal(update.$set.outcome.scoringDifference, 3)
    assert.equal(options.timestamps, false)
})
