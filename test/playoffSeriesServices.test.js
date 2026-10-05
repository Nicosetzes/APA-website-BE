const assert = require("node:assert/strict")
const test = require("node:test")
const {
    buildLegsForTie,
    calculatePhysicalOutcome,
    toCompetitorUnit,
} = require("../service/playoffSeries")
const {
    createProcessPlayoffSeriesResult,
} = require("../service/processPlayoffSeriesResult")
const {
    createRemovePlayoffSeriesResult,
} = require("../service/removePlayoffSeriesResult")

const ref = (id, name = `Reference ${id}`) => ({ id: String(id), name })
const unit = (id, seed) => ({
    team: ref(`team-${id}`, `Team ${id}`),
    player: ref(`player-${id}`, `Player ${id}`),
    seed,
})
const tournamentFixture = () => ({
    _id: "tournament",
    id: "tournament",
    name: "Copa",
    format: "playoff",
    playoffMode: "two_legged",
    ongoing: true,
})

const clone = (value) => JSON.parse(JSON.stringify(value))
const queryResult = (getValue) => ({ session: async () => getValue() })

const createEnvironment = ({ playoffId = 1 } = {}) => {
    const tournament = tournamentFixture()
    const matches = buildLegsForTie({
        tournament,
        playoffId,
        unitA: unit(1, `${playoffId}A`),
        unitB: unit(2, `${playoffId}B`),
    }).map((match, index) => ({ ...match, _id: `match-${index + 1}` }))
    let nextId = 10

    const Match = {
        findById: (id) =>
            queryResult(() =>
                matches.find((match) => String(match._id) === String(id))
            ),
        insertMany: async (documents) => {
            const inserted = documents.map((document) => ({
                ...clone(document),
                _id: `match-${nextId++}`,
            }))
            for (const document of inserted) {
                if (
                    matches.some(
                        (match) =>
                            String(match.tournament.id) ===
                                String(document.tournament.id) &&
                            match.playoff_id === document.playoff_id &&
                            match.leg === document.leg
                    )
                ) {
                    const error = new Error("duplicate")
                    error.code = 11000
                    throw error
                }
            }
            matches.push(...inserted)
            return inserted
        },
        findOneAndUpdate: async (filter, update) => {
            const match = matches.find(
                (candidate) =>
                    String(candidate._id) === String(filter._id) &&
                    (filter.played === undefined ||
                        candidate.played === filter.played)
            )
            if (!match) return null
            for (const key of Object.keys(update.$unset || {}))
                delete match[key]
            Object.assign(match, update.$set || {})
            return match
        },
    }
    const Tournament = {
        findById: (id) =>
            queryResult(() =>
                String(id) === String(tournament._id) ? tournament : null
            ),
        updateOne: async (filter, update) => {
            if (
                String(filter._id) !== String(tournament._id) ||
                (filter.ongoing?.$ne === false && tournament.ongoing === false)
            ) {
                return { modifiedCount: 0 }
            }
            Object.assign(tournament, clone(update.$set))
            return { modifiedCount: 1 }
        },
    }
    const findSeries = async (tournamentId, tieId) =>
        matches
            .filter(
                (match) =>
                    String(match.tournament.id) === String(tournamentId) &&
                    match.type === "playoff" &&
                    Number(match.playoff_id) === Number(tieId)
            )
            .sort((left, right) => left.leg - right.leg)
    const claimRevision = async (tournamentId, tieId, revision) => {
        const canonical = matches.find(
            (match) =>
                String(match.tournament.id) === String(tournamentId) &&
                match.playoff_id === tieId &&
                match.leg === 1 &&
                match.seriesRevision === revision
        )
        if (!canonical) return null
        canonical.seriesRevision += 1
        return canonical
    }
    const updateResult = async (id, result, { requirePending }) => {
        const match = matches.find((candidate) => candidate._id === id)
        if (!match || (requirePending && match.played !== false)) return null
        Object.assign(match, clone(result))
        return match
    }
    const updateSlots = async (tournamentId, tieId, updates) =>
        updates.map(({ leg, fields, emptyTeamField }) => {
            const match = matches.find(
                (candidate) =>
                    String(candidate.tournament.id) === String(tournamentId) &&
                    candidate.playoff_id === tieId &&
                    candidate.leg === leg &&
                    candidate[emptyTeamField] == null
            )
            if (!match) return { modifiedCount: 0 }
            Object.assign(match, clone(fields))
            return { modifiedCount: 1 }
        })
    const deleteTiebreak = async (tournamentId, tieId) => {
        const index = matches.findIndex(
            (match) =>
                String(match.tournament.id) === String(tournamentId) &&
                match.playoff_id === tieId &&
                match.leg === 3 &&
                match.played === false
        )
        if (index >= 0) matches.splice(index, 1)
        return { deletedCount: index >= 0 ? 1 : 0 }
    }
    const runInTransaction = async (callback) => {
        const matchesSnapshot = clone(matches)
        const tournamentSnapshot = clone(tournament)
        try {
            return await callback({ id: "session" })
        } catch (error) {
            matches.splice(0, matches.length, ...matchesSnapshot)
            for (const key of Object.keys(tournament)) delete tournament[key]
            Object.assign(tournament, tournamentSnapshot)
            throw error
        }
    }
    const dependencies = {
        matchesModel: Match,
        tournamentsModel: Tournament,
        findPlayoffSeriesByTie: findSeries,
        claimPlayoffSeriesRevision: claimRevision,
        updatePlayoffSeriesMatchResult: updateResult,
        updatePlayoffSeriesSlots: updateSlots,
        deletePendingPlayoffTiebreak: deleteTiebreak,
        withTransaction: runInTransaction,
        logger: { warn() {} },
        ensurePlayoffLegIndexReady: async () => true,
    }

    return {
        dependencies,
        matches,
        tournament,
        Match,
        claimRevision,
        findSeries,
    }
}

const bodyFor = (match, scoreP1, scoreP2, extra = {}) => ({
    playerP1: match.playerP1,
    teamP1: match.teamP1,
    seedP1: match.seedP1,
    scoreP1,
    playerP2: match.playerP2,
    teamP2: match.teamP2,
    seedP2: match.seedP2,
    scoreP2,
    ...extra,
})

const markPlayed = (match, scoreP1, scoreP2) => {
    const body = bodyFor(match, scoreP1, scoreP2)
    Object.assign(match, {
        scoreP1,
        scoreP2,
        played: true,
        outcome: calculatePhysicalOutcome({ match, body, decisive: false }),
    })
}

test("managed mutation services check index readiness before transactions", async () => {
    for (const createService of [
        createProcessPlayoffSeriesResult,
        createRemovePlayoffSeriesResult,
    ]) {
        const environment = createEnvironment()
        const unavailable = new Error("index unavailable")
        let transactionCalls = 0
        environment.dependencies.ensurePlayoffLegIndexReady = async () => {
            throw unavailable
        }
        environment.dependencies.withTransaction = async () => {
            transactionCalls += 1
        }
        const service = createService(environment.dependencies)

        await assert.rejects(
            service({
                tournamentId: "tournament",
                matchId: environment.matches[0]._id,
                body: bodyFor(environment.matches[0], 1, 0),
                expectedSeriesRevision: 0,
            }),
            unavailable
        )
        assert.equal(transactionCalls, 0)
    }
})

test("first feeder creates a complete TBD successor and returns decorated state", async () => {
    const environment = createEnvironment()
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    const result = await service({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 0, 1, { expectedSeriesRevision: 0 }),
    })

    const successor = environment.matches.filter(
        ({ playoff_id }) => playoff_id === 17
    )
    assert.equal(successor.length, 2)
    assert.equal(successor[0].teamP1.id, first.teamP1.id)
    assert.equal(successor[0].teamP2, null)
    assert.equal(successor[1].teamP1, null)
    assert.equal(successor[1].teamP2.id, first.teamP1.id)
    assert.equal(result.series.status, "decided")
    assert.equal(result.series.winnerTeamId, first.teamP1.id)
})

test("equivalent replay preserves revision, successor and full valid state", async () => {
    const environment = createEnvironment()
    const [first, second] = environment.matches
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await service({
        tournamentId: "tournament",
        matchId: first._id,
        body: bodyFor(first, 2, 0, { valid: true }),
    })
    assert.equal(first.seriesRevision, 1)
    await service({
        tournamentId: "tournament",
        matchId: first._id,
        body: bodyFor(first, 2, 0, {
            valid: false,
            expectedSeriesRevision: 1,
        }),
    })
    assert.equal(first.valid, false)
    assert.equal(first.seriesRevision, 2)

    await service({
        tournamentId: "tournament",
        matchId: first._id,
        body: bodyFor(first, 2, 0, {
            valid: false,
            expectedSeriesRevision: 1,
        }),
    })
    assert.equal(first.seriesRevision, 2)
    assert.equal(environment.matches.length, 2)
})

test("missing return leg is a typed configuration conflict with rollback", async () => {
    const environment = createEnvironment()
    const [first] = environment.matches
    environment.matches.splice(1, 1)
    const before = clone(environment.matches)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await assert.rejects(
        service({
            tournamentId: "tournament",
            matchId: first._id,
            body: bodyFor(first, 1, 0),
        }),
        { status: 409, code: "PLAYOFF_CONFIGURATION_ERROR" }
    )
    assert.deepEqual(environment.matches, before)
})

test("CAS conflict re-read converges to an equivalent result", async () => {
    const environment = createEnvironment()
    const [first] = environment.matches
    let firstClaim = true
    const body = bodyFor(first, 1, 0)
    const outcome = calculatePhysicalOutcome({
        match: first,
        body,
        decisive: false,
    })
    environment.dependencies.claimPlayoffSeriesRevision = async (...args) => {
        if (firstClaim) {
            firstClaim = false
            first.seriesRevision += 1
            Object.assign(first, { ...body, outcome, played: true })
            return null
        }
        return environment.claimRevision(...args)
    }
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    const result = await service({
        tournamentId: "tournament",
        matchId: first._id,
        body,
    })

    assert.equal(result.series.status, "awaiting_leg2")
    assert.equal(first.seriesRevision, 1)
})

test("managed successor with a TBD participant rejects a result with typed 409", async () => {
    const environment = createEnvironment({ playoffId: 17 })
    const [first, second] = environment.matches
    for (const match of [first, second]) {
        const side = match.leg === 1 ? "P2" : "P1"
        match[`team${side}`] = null
        match[`player${side}`] = null
        match[`seed${side}`] = null
    }
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await assert.rejects(
        service({
            tournamentId: "tournament",
            matchId: first._id,
            body: bodyFor(first, 1, 0),
        }),
        { status: 409, code: "PLAYOFF_SERIES_NOT_READY" }
    )
})

test("ordinary revisionless edit still requires the current revision", async () => {
    const environment = createEnvironment()
    const [first] = environment.matches
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await assert.rejects(
        service({
            tournamentId: "tournament",
            matchId: first._id,
            body: bodyFor(first, 2, 0),
        }),
        { status: 400, code: "EXPECTED_SERIES_REVISION_REQUIRED" }
    )
})

test("divergent revisionless first-write CAS race returns state conflict", async () => {
    const environment = createEnvironment()
    const [first] = environment.matches
    let firstClaim = true
    environment.dependencies.withTransaction = async (callback) =>
        callback({ id: "session" })
    environment.dependencies.claimPlayoffSeriesRevision = async (...args) => {
        if (!firstClaim) return environment.claimRevision(...args)

        firstClaim = false
        const competingBody = bodyFor(first, 2, 0)
        first.seriesRevision += 1
        Object.assign(first, {
            scoreP1: 2,
            scoreP2: 0,
            outcome: calculatePhysicalOutcome({
                match: first,
                body: competingBody,
                decisive: false,
            }),
            played: true,
        })
        return null
    }
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await assert.rejects(
        service({
            tournamentId: "tournament",
            matchId: first._id,
            body: bodyFor(first, 1, 0),
        }),
        { status: 409, code: "PLAYOFF_STATE_CONFLICT" }
    )
})

test("persistent duplicate tiebreak is translated and both attempts roll back", async () => {
    const environment = createEnvironment()
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    environment.Match.insertMany = async () => {
        const error = new Error("duplicate")
        error.code = 11000
        throw error
    }
    const before = clone(environment.matches)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await assert.rejects(
        service({
            tournamentId: "tournament",
            matchId: second._id,
            body: bodyFor(second, 1, 0, { expectedSeriesRevision: 0 }),
        }),
        { status: 409, code: "PLAYOFF_DUPLICATE_LEG" }
    )
    assert.deepEqual(environment.matches, before)
})

test("removal is idempotent and does not bump an already clean series", async () => {
    const environment = createEnvironment()
    const [first] = environment.matches
    markPlayed(first, 1, 0)
    const service = createRemovePlayoffSeriesResult(environment.dependencies)

    const cleaned = await service({
        tournamentId: "tournament",
        matchId: first._id,
        expectedSeriesRevision: 0,
    })
    assert.equal(cleaned.played, false)
    assert.equal(first.seriesRevision, 1)

    await service({
        tournamentId: "tournament",
        matchId: first._id,
        expectedSeriesRevision: 0,
    })
    assert.equal(first.seriesRevision, 1)
})

test("removal guards missing tournament, canonical leg and later played leg", async () => {
    const missingTournament = createEnvironment()
    missingTournament.tournament._id = "other"
    let service = createRemovePlayoffSeriesResult(
        missingTournament.dependencies
    )
    await assert.rejects(
        service({ tournamentId: "tournament", matchId: "match-1" }),
        { status: 404, code: "TOURNAMENT_NOT_FOUND" }
    )

    const missingCanonical = createEnvironment()
    missingCanonical.matches.splice(0, 1)
    service = createRemovePlayoffSeriesResult(missingCanonical.dependencies)
    await assert.rejects(
        service({
            tournamentId: "tournament",
            matchId: "match-2",
            expectedSeriesRevision: 0,
        }),
        { status: 409, code: "PLAYOFF_CONFIGURATION_ERROR" }
    )

    const laterPlayed = createEnvironment()
    markPlayed(laterPlayed.matches[0], 1, 0)
    markPlayed(laterPlayed.matches[1], 0, 1)
    const snapshot = clone(laterPlayed.matches)
    service = createRemovePlayoffSeriesResult(laterPlayed.dependencies)
    await assert.rejects(
        service({
            tournamentId: "tournament",
            matchId: "match-1",
            expectedSeriesRevision: 0,
        }),
        { status: 409, code: "PLAYOFF_LATER_LEG_PLAYED" }
    )
    assert.deepEqual(laterPlayed.matches, snapshot)
})

test("tied aggregate creates one tiebreak and its result advances the winner", async () => {
    const environment = createEnvironment()
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    const secondResult = await service({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 1, 0, { expectedSeriesRevision: 0 }),
    })
    const tiebreak = environment.matches.find(({ leg }) => leg === 3)
    assert.ok(tiebreak)
    assert.equal(secondResult.series.status, "awaiting_tiebreak")

    const decided = await service({
        tournamentId: "tournament",
        matchId: tiebreak._id,
        body: bodyFor(tiebreak, 0, 1, { expectedSeriesRevision: 1 }),
    })
    assert.equal(decided.series.status, "decided")
    assert.equal(
        environment.matches.filter(({ playoff_id }) => playoff_id === 17)
            .length,
        2
    )
})

test("second feeder fills the canonical destination slot and its mirror", async () => {
    const environment = createEnvironment({ playoffId: 2 })
    const [first, second] = environment.matches
    const existingDestination = buildLegsForTie({
        tournament: environment.tournament,
        playoffId: 17,
        unitA: unit(9, "source-1"),
        unitB: null,
    }).map((match, index) => ({ ...match, _id: `destination-${index}` }))
    environment.matches.push(...existingDestination)
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await service({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 0, 1, { expectedSeriesRevision: 0 }),
    })

    const destinationFirst = environment.matches.find(
        ({ playoff_id, leg }) => playoff_id === 17 && leg === 1
    )
    const destinationSecond = environment.matches.find(
        ({ playoff_id, leg }) => playoff_id === 17 && leg === 2
    )
    assert.equal(destinationFirst.teamP2.id, first.teamP1.id)
    assert.equal(destinationSecond.teamP1.id, first.teamP1.id)
    assert.equal(destinationFirst.seriesRevision, 1)
})

test("removing a return result deletes only its pending derived tiebreak", async () => {
    const environment = createEnvironment()
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    const process = createProcessPlayoffSeriesResult(environment.dependencies)
    await process({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 1, 0, { expectedSeriesRevision: 0 }),
    })
    assert.ok(environment.matches.some(({ leg }) => leg === 3))

    const remove = createRemovePlayoffSeriesResult(environment.dependencies)
    await remove({
        tournamentId: "tournament",
        matchId: second._id,
        expectedSeriesRevision: 1,
    })
    assert.equal(
        environment.matches.some(({ leg }) => leg === 3),
        false
    )
    assert.equal(second.played, false)
})

test("final closes fail-closed and later correction is rejected", async () => {
    const environment = createEnvironment({ playoffId: 31 })
    const [final] = environment.matches
    const process = createProcessPlayoffSeriesResult(environment.dependencies)
    await process({
        tournamentId: "tournament",
        matchId: final._id,
        body: bodyFor(final, 2, 1),
    })
    assert.equal(environment.tournament.ongoing, false)
    assert.equal(
        environment.tournament.outcome.champion.team.id,
        final.teamP1.id
    )

    const remove = createRemovePlayoffSeriesResult(environment.dependencies)
    await assert.rejects(
        remove({
            tournamentId: "tournament",
            matchId: final._id,
            expectedSeriesRevision: 1,
        }),
        { status: 409, code: "PLAYOFF_SERIES_ADVANCED" }
    )
})

test("team-identified aggregate remains stable when the return leg swaps sides", () => {
    const environment = createEnvironment()
    const [first, second] = environment.matches
    assert.deepEqual(
        toCompetitorUnit(first, "P1"),
        toCompetitorUnit(second, "P2")
    )
})
