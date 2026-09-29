const assert = require("node:assert/strict")
const test = require("node:test")

const matchesModel = require("../dao/models/matches")
const findPlayinMatchesByTournamentId = require("../dao/findPlayinMatchesByTournamentId")
const generatePlayinUpdate = require("../service/generatePlayinUpdate")

const tournament = { id: "tournament", name: "Tournament" }

const outcome = (prefix) => ({
    playerThatWon: { id: `${prefix}-winner`, name: "Winner" },
    teamThatWon: { id: `${prefix}-winner-team`, name: "Winner Team" },
    seedFromTeamThatWon: `${prefix}W`,
    playerThatLost: { id: `${prefix}-loser`, name: "Loser" },
    teamThatLost: { id: `${prefix}-loser-team`, name: "Loser Team" },
    seedFromTeamThatLost: `${prefix}L`,
})

const played = (playoffId, group) => ({
    playoff_id: playoffId,
    played: true,
    group,
    outcome: outcome(String(playoffId)),
})

const pending = (playoffId, group) => ({
    playoff_id: playoffId,
    played: false,
    group,
})

const stubWrites = (t) => {
    const originalInsertMany = matchesModel.insertMany
    const originalFindOneAndUpdate = matchesModel.findOneAndUpdate
    const writes = { created: [], updated: [] }

    t.after(() => {
        matchesModel.insertMany = originalInsertMany
        matchesModel.findOneAndUpdate = originalFindOneAndUpdate
    })

    matchesModel.insertMany = async (documents, options) => {
        writes.created.push({ documents, options })
        return documents
    }
    matchesModel.findOneAndUpdate = async (filter, update, options) => {
        writes.updated.push({ filter, update, options })
        return { filter, update }
    }

    return writes
}

test("loser of 1 faces winner of 2 in match 5, loser of 3 faces winner of 4 in match 6", async (t) => {
    const writes = stubWrites(t)

    // El orden del array no importa: se resuelve por playoff_id.
    const result = await generatePlayinUpdate(tournament, [
        played(4, "B"),
        played(2, "A"),
        played(3, "B"),
        played(1, "A"),
    ])

    const [fifth, sixth] = writes.created[0].documents

    assert.equal(writes.created.length, 1)
    assert.equal(result.created.length, 2)
    assert.deepEqual(result.updated, [])

    assert.equal(fifth.playoff_id, 5)
    assert.equal(fifth.playerP1.id, "1-loser")
    assert.equal(fifth.teamP1.id, "1-loser-team")
    assert.equal(fifth.seedP1, "1L")
    assert.equal(fifth.playerP2.id, "2-winner")
    assert.equal(fifth.teamP2.id, "2-winner-team")
    assert.equal(fifth.seedP2, "2W")
    assert.equal(fifth.group, "A")

    assert.equal(sixth.playoff_id, 6)
    assert.equal(sixth.playerP1.id, "3-loser")
    assert.equal(sixth.playerP2.id, "4-winner")
    assert.equal(sixth.group, "B")

    for (const match of [fifth, sixth]) {
        assert.equal(match.type, "playin")
        assert.equal(match.played, false)
        assert.equal(match.tournament, tournament)
    }
})

test("the first-round winners of 1 and 3 never enter the second round", async (t) => {
    const writes = stubWrites(t)

    await generatePlayinUpdate(tournament, [
        played(1, "A"),
        played(2, "A"),
        played(3, "B"),
        played(4, "B"),
    ])

    const players = writes.created[0].documents.flatMap((match) => [
        match.playerP1.id,
        match.playerP2.id,
    ])

    assert.equal(players.includes("1-winner"), false)
    assert.equal(players.includes("3-winner"), false)
})

test("one decided source creates the destination with the other side empty", async (t) => {
    const writes = stubWrites(t)

    await generatePlayinUpdate(tournament, [
        pending(1, "A"),
        played(2, "A"),
        pending(3, "B"),
        pending(4, "B"),
    ])

    const [fifth] = writes.created[0].documents

    assert.equal(writes.created[0].documents.length, 1)
    assert.equal(fifth.playoff_id, 5)
    assert.equal(fifth.playerP1, null)
    assert.equal(fifth.teamP1, null)
    assert.equal(fifth.seedP1, null)
    assert.equal(fifth.playerP2.id, "2-winner")
})

test("a later result fills only the empty side of an existing destination", async (t) => {
    const writes = stubWrites(t)
    const session = { id: "session" }

    const result = await generatePlayinUpdate(
        tournament,
        [
            played(1, "A"),
            played(2, "A"),
            pending(3, "B"),
            pending(4, "B"),
            {
                playoff_id: 5,
                played: false,
                group: "A",
                playerP1: null,
                teamP1: null,
                playerP2: { id: "2-winner" },
                teamP2: { id: "2-winner-team" },
            },
        ],
        { session }
    )

    assert.deepEqual(writes.created, [])
    assert.equal(writes.updated.length, 1)
    assert.equal(result.updated.length, 1)

    const { filter, update, options } = writes.updated[0]
    assert.deepEqual(filter, {
        "tournament.id": "tournament",
        playoff_id: 5,
        type: "playin",
    })
    assert.deepEqual(Object.keys(update.$set).sort(), [
        "playerP1",
        "seedP1",
        "teamP1",
    ])
    assert.equal(update.$set.playerP1.id, "1-loser")
    assert.equal(options.session, session)
    assert.equal(options.new, true)
})

test("nothing is written when the destinations are complete or no source is decided", async (t) => {
    const writes = stubWrites(t)
    const full = (playoffId) => ({
        playoff_id: playoffId,
        played: false,
        playerP1: { id: "p1" },
        playerP2: { id: "p2" },
    })

    const complete = await generatePlayinUpdate(tournament, [
        played(1, "A"),
        played(2, "A"),
        played(3, "B"),
        played(4, "B"),
        full(5),
        full(6),
    ])
    const undecided = await generatePlayinUpdate(tournament, [
        pending(1, "A"),
        pending(2, "A"),
    ])

    assert.deepEqual(complete, { created: [], updated: [] })
    assert.deepEqual(undecided, { created: [], updated: [] })
    assert.deepEqual(writes, { created: [], updated: [] })
})

test("a played match without the needed outcome side is not a source", async (t) => {
    const writes = stubWrites(t)

    await generatePlayinUpdate(tournament, [
        { playoff_id: 1, played: true, outcome: {} },
        { playoff_id: 2, played: true, outcome: {} },
    ])

    assert.deepEqual(writes, { created: [], updated: [] })
})

test("second-round creation receives the transaction session", async (t) => {
    const writes = stubWrites(t)
    const session = { id: "session" }

    await generatePlayinUpdate(tournament, [played(1, "A"), played(2, "A")], {
        session,
    })

    assert.equal(writes.created[0].options.session, session)
})

test("play-in reads attach the session and keep the playoff_id sort", async (t) => {
    const originalFind = matchesModel.find
    const session = { id: "session" }
    const query = {
        receivedFilter: null,
        receivedSession: null,
        receivedSort: null,
        sort(sort) {
            this.receivedSort = sort
            return this
        },
        session(value) {
            this.receivedSession = value
            return this
        },
        then(resolve, reject) {
            return Promise.resolve([]).then(resolve, reject)
        },
    }

    t.after(() => {
        matchesModel.find = originalFind
    })

    matchesModel.find = (filter) => {
        query.receivedFilter = filter
        return query
    }

    await findPlayinMatchesByTournamentId("tournament", { session })

    assert.deepEqual(query.receivedFilter, {
        "tournament.id": "tournament",
        type: "playin",
    })
    assert.equal(query.receivedSession, session)
    assert.deepEqual(query.receivedSort, { playoff_id: 1 })
})
