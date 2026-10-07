const assert = require("node:assert/strict")
const test = require("node:test")
const matchesModel = require("../dao/models/matches")
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

const INITIAL_UPDATED_AT = "2026-03-01T00:00:00.000Z"

const valueAt = (document, path) =>
    path.split(".").reduce((value, key) => value?.[key], document)
const matchesFilter = (document, filter) =>
    Object.entries(filter).every(([path, expected]) => {
        if (expected === undefined) return true
        const value = valueAt(document, path)
        return expected === null
            ? value == null
            : String(value) === String(expected)
    })

const createEnvironment = ({ playoffId = 1 } = {}) => {
    const tournament = tournamentFixture()
    const matches = buildLegsForTie({
        tournament,
        playoffId,
        unitA: unit(1, `${playoffId}A`),
        unitB: unit(2, `${playoffId}B`),
    }).map((match, index) => ({
        ...match,
        _id: `match-${index + 1}`,
        updatedAt: INITIAL_UPDATED_AT,
    }))
    let nextId = 10
    let tick = 0
    const clock = () =>
        new Date(Date.UTC(2026, 3, 1, 0, 0, ++tick)).toISOString()
    // Simula los timestamps de Mongoose: toda escritura sin
    // `timestamps: false` mueve updatedAt.
    const applyUpdate = (document, update, options = {}) => {
        for (const [key, amount] of Object.entries(update.$inc || {}))
            document[key] = (document[key] || 0) + amount
        for (const key of Object.keys(update.$unset || {})) delete document[key]
        Object.assign(document, clone(update.$set || {}))
        if (options?.timestamps !== false) document.updatedAt = clock()
    }

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
        findOneAndUpdate: async (filter, update, options) => {
            const match = matches.find((candidate) =>
                matchesFilter(candidate, filter)
            )
            if (!match) return null
            applyUpdate(match, update, options)
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
    }

    return {
        dependencies,
        matches,
        tournament,
        Match,
        claimRevision,
        findSeries,
        applyUpdate,
    }
}

// Reemplaza los stubs de DAO por los DAO reales (claim de revisión, resultado
// y slots) sobre un modelo falso, para que las opciones que pasan los DAO
// decidan si updatedAt se mueve.
const useRealSeriesDaos = (t, environment) => {
    const originalFindOneAndUpdate = matchesModel.findOneAndUpdate
    const originalUpdateOne = matchesModel.updateOne
    t.after(() => {
        matchesModel.findOneAndUpdate = originalFindOneAndUpdate
        matchesModel.updateOne = originalUpdateOne
    })
    const find = (filter) =>
        environment.matches.find((match) => matchesFilter(match, filter))

    matchesModel.findOneAndUpdate = async (filter, update, options) => {
        const match = find(filter)
        if (!match) return null
        environment.applyUpdate(match, update, options)
        return match
    }
    matchesModel.updateOne = async (filter, update, options) => {
        const match = find(filter)
        if (!match) return { modifiedCount: 0 }
        environment.applyUpdate(match, update, options)
        return { modifiedCount: 1 }
    }

    delete environment.dependencies.claimPlayoffSeriesRevision
    delete environment.dependencies.updatePlayoffSeriesMatchResult
    delete environment.dependencies.updatePlayoffSeriesSlots
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
    // El cierre toma la fecha del partido que decidió la final.
    assert.ok(final.playedAt)
    assert.equal(
        new Date(environment.tournament.closedAt).getTime(),
        new Date(final.playedAt).getTime()
    )
    assert.equal(environment.tournament.closedAtPrecision, "exact")

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

test("series final closure inherits the final's playedAt precision", async () => {
    const environment = createEnvironment({ playoffId: 31 })
    const [final] = environment.matches
    const updateResult = environment.dependencies.updatePlayoffSeriesMatchResult
    environment.dependencies.updatePlayoffSeriesMatchResult = async (
        ...args
    ) => {
        const updated = await updateResult(...args)
        if (updated) {
            updated.playedAt = "2022-11-15T00:00:00.000Z"
            updated.playedAtPrecision = "day"
        }
        return updated
    }
    const process = createProcessPlayoffSeriesResult(environment.dependencies)

    await process({
        tournamentId: "tournament",
        matchId: final._id,
        body: bodyFor(final, 2, 1),
    })

    assert.equal(environment.tournament.ongoing, false)
    assert.equal(environment.tournament.closedAt, "2022-11-15T00:00:00.000Z")
    assert.equal(environment.tournament.closedAtPrecision, "day")
})

test("loading the return leg does not move the first leg updatedAt", async (t) => {
    const environment = createEnvironment()
    useRealSeriesDaos(t, environment)
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    const result = await service({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 1, 0, { expectedSeriesRevision: 0 }),
    })

    assert.equal(result.series.status, "awaiting_tiebreak")
    assert.equal(first.seriesRevision, 1)
    assert.equal(first.updatedAt, INITIAL_UPDATED_AT)
    assert.notEqual(second.updatedAt, INITIAL_UPDATED_AT)
    // Sólo la pierna cargada recibe playedAt; ni la ida ni el desempate.
    assert.equal(first.playedAt, undefined)
    assert.equal(first.playedAtPrecision, undefined)
    assert.ok(Number.isFinite(Date.parse(second.playedAt)))
    assert.equal(second.playedAtPrecision, "exact")
    const tiebreak = environment.matches.find(({ leg }) => leg === 3)
    assert.equal(tiebreak.playedAt, undefined)
})

test("re-editing the return leg does not move the first leg updatedAt", async (t) => {
    const environment = createEnvironment()
    useRealSeriesDaos(t, environment)
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)
    await service({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 1, 0, { expectedSeriesRevision: 0 }),
    })
    const loadedAt = second.updatedAt
    const playedAt = second.playedAt
    assert.ok(playedAt)

    const result = await service({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 2, 0, { expectedSeriesRevision: 1 }),
    })

    assert.equal(result.series.status, "decided")
    assert.equal(first.seriesRevision, 2)
    assert.equal(first.updatedAt, INITIAL_UPDATED_AT)
    assert.notEqual(second.updatedAt, loadedAt)
    // Editar el resultado no mueve playedAt.
    assert.equal(second.playedAt, playedAt)
    assert.equal(second.playedAtPrecision, "exact")
    assert.equal(first.playedAt, undefined)
    assert.equal(
        environment.matches.some(({ leg }) => leg === 3),
        false
    )
})

test("removing the return leg does not move the first leg updatedAt", async (t) => {
    const environment = createEnvironment()
    useRealSeriesDaos(t, environment)
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    const process = createProcessPlayoffSeriesResult(environment.dependencies)
    await process({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 1, 0, { expectedSeriesRevision: 0 }),
    })
    const loadedAt = second.updatedAt

    const remove = createRemovePlayoffSeriesResult(environment.dependencies)
    const cleaned = await remove({
        tournamentId: "tournament",
        matchId: second._id,
        expectedSeriesRevision: 1,
    })

    assert.equal(cleaned.played, false)
    assert.equal(first.seriesRevision, 2)
    assert.equal(first.updatedAt, INITIAL_UPDATED_AT)
    assert.notEqual(second.updatedAt, loadedAt)
    // Borrar el resultado borra playedAt y su precisión.
    assert.equal("playedAt" in second, false)
    assert.equal("playedAtPrecision" in second, false)
})

test("editing a leg played before the backfill keeps its previous updatedAt as playedAt", async (t) => {
    const environment = createEnvironment()
    useRealSeriesDaos(t, environment)
    const [first, second] = environment.matches
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    await service({
        tournamentId: "tournament",
        matchId: first._id,
        body: bodyFor(first, 2, 0, { expectedSeriesRevision: 0 }),
    })

    assert.equal(first.scoreP1, 2)
    assert.equal(
        new Date(first.playedAt).toISOString(),
        new Date(INITIAL_UPDATED_AT).toISOString()
    )
    assert.equal(first.playedAtPrecision, "exact")
    assert.equal(second.playedAt, undefined)
})

test("advancing a winner keeps bookkeeping without moving sibling updatedAt", async (t) => {
    const environment = createEnvironment({ playoffId: 2 })
    useRealSeriesDaos(t, environment)
    const [first, second] = environment.matches
    const existingDestination = buildLegsForTie({
        tournament: environment.tournament,
        playoffId: 17,
        unitA: unit(9, "source-1"),
        unitB: null,
    }).map((match, index) => ({
        ...match,
        _id: `destination-${index}`,
        updatedAt: INITIAL_UPDATED_AT,
    }))
    environment.matches.push(...existingDestination)
    markPlayed(first, 1, 0)
    const service = createProcessPlayoffSeriesResult(environment.dependencies)

    const result = await service({
        tournamentId: "tournament",
        matchId: second._id,
        body: bodyFor(second, 0, 1, { expectedSeriesRevision: 0 }),
    })

    const [destinationFirst, destinationSecond] = existingDestination
    assert.equal(result.series.status, "decided")
    assert.equal(first.seriesRevision, 1)
    assert.equal(first.updatedAt, INITIAL_UPDATED_AT)
    assert.equal(destinationFirst.seriesRevision, 1)
    assert.equal(destinationFirst.teamP2.id, first.teamP1.id)
    assert.equal(destinationSecond.teamP1.id, first.teamP1.id)
    assert.equal(destinationFirst.updatedAt, INITIAL_UPDATED_AT)
    assert.equal(destinationSecond.updatedAt, INITIAL_UPDATED_AT)
    // Los slots de destino y la ida no reciben playedAt.
    assert.equal(first.playedAt, undefined)
    assert.equal(destinationFirst.playedAt, undefined)
    assert.equal(destinationSecond.playedAt, undefined)
    assert.ok(second.playedAt)
})

test("team-identified aggregate remains stable when the return leg swaps sides", () => {
    const environment = createEnvironment()
    const [first, second] = environment.matches
    assert.deepEqual(
        toCompetitorUnit(first, "P1"),
        toCompetitorUnit(second, "P2")
    )
})
