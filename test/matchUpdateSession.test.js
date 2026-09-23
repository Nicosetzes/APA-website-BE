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
    assert.deepEqual(matchesQuery.receivedSort, { playoff_id: 1 })
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
