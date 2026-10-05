const assert = require("node:assert/strict")
const test = require("node:test")
const {
    assertDirectPlayoffGeometry,
    assertSeriesStructure,
    buildLegsForTie,
    calculateSeriesState,
    decoratePlayoffSeriesMatches,
    deriveMutationPolicy,
    getSuccessorDescriptor,
    normalizeLeg,
    normalizePlayoffMode,
    sameUnit,
    toCompetitorUnit,
    validateSeriesResultRequest,
} = require("../service/playoffSeries")

const team = (id) => ({ id: String(id), name: `Team ${id}` })
const player = (id) => ({ id: String(id), name: `Player ${id}` })
const unit = (id, seed) => ({ team: team(id), player: player(id), seed })

const tournament = {
    _id: "tournament",
    name: "Copa",
    format: "playoff",
    playoffMode: "two_legged",
}

test("legacy normalization is in-memory only", () => {
    const legacyTournament = { format: "playoff" }
    const legacyMatch = { playoff_id: 1 }
    assert.equal(normalizePlayoffMode(legacyTournament), "single")
    assert.equal(normalizeLeg(legacyMatch), 1)
    assert.equal(legacyTournament.playoffMode, undefined)
    assert.equal(legacyMatch.leg, undefined)
})

test("two-legged construction preserves and reverses complete units", () => {
    const left = unit(1, "1A")
    const right = unit(2, "1B")
    const matches = buildLegsForTie({
        tournament,
        playoffId: 1,
        unitA: left,
        unitB: right,
    })
    assert.equal(matches.length, 2)
    assert(sameUnit(toCompetitorUnit(matches[0], "P1"), left))
    assert(sameUnit(toCompetitorUnit(matches[1], "P2"), left))
    assert(sameUnit(toCompetitorUnit(matches[0], "P2"), right))
    assert(sameUnit(toCompetitorUnit(matches[1], "P1"), right))
    assert.equal(matches[0].seriesRevision, 0)
    assert.equal(matches[1].seriesRevision, undefined)
})

test("aggregate follows team identity and excludes penalty outcome", () => {
    const [first, second] = buildLegsForTie({
        tournament,
        playoffId: 1,
        unitA: unit(1, "1A"),
        unitB: unit(2, "1B"),
    })
    Object.assign(first, {
        played: true,
        scoreP1: 2,
        scoreP2: 1,
        outcome: { penalties: true, scoreFromTeamThatWon: 99 },
    })
    Object.assign(second, { played: true, scoreP1: 3, scoreP2: 0 })
    assert.deepEqual(calculateSeriesState([second, first]), {
        status: "decided",
        aggregate: [
            { teamId: "1", score: 2 },
            { teamId: "2", score: 4 },
        ],
        winner: unit(2, "1B"),
    })
})

test("all source ids derive destination and side by geometry", () => {
    for (let id = 1; id <= 30; id += 1) {
        const descriptor = getSuccessorDescriptor(id)
        assert(descriptor)
        assert(descriptor.destinationPlayoffId > id)
        assert.equal(descriptor.logicalSide, id % 2 ? "P1" : "P2")
    }
    assert.equal(getSuccessorDescriptor(31), null)
})

test("series legs accept draws without penalties but reject penalties", () => {
    const [first, second] = buildLegsForTie({
        tournament,
        playoffId: 1,
        unitA: unit(1, "1A"),
        unitB: unit(2, "1B"),
    })
    const body = {
        playerP1: first.playerP1,
        teamP1: first.teamP1,
        seedP1: first.seedP1,
        scoreP1: 1,
        playerP2: first.playerP2,
        teamP2: first.teamP2,
        seedP2: first.seedP2,
        scoreP2: 1,
    }
    assert.doesNotThrow(() =>
        validateSeriesResultRequest({
            tournament,
            match: first,
            tieMatches: [first, second],
            body,
        })
    )
    assert.throws(
        () =>
            validateSeriesResultRequest({
                tournament,
                match: first,
                tieMatches: [first, second],
                body: { ...body, penaltyScoreP1: 4, penaltyScoreP2: 3 },
            }),
        { code: "PENALTIES_NOT_ALLOWED" }
    )
})

test("TBD successor decorates safely and malformed ties are isolated", () => {
    const [first, second] = buildLegsForTie({
        tournament,
        playoffId: 17,
        unitA: unit(1, "17A"),
        unitB: null,
    }).map((match, index) => ({ ...match, _id: `successor-${index}` }))

    assert.doesNotThrow(() =>
        assertSeriesStructure(tournament, [first, second])
    )
    const decorated = decoratePlayoffSeriesMatches(tournament, [first, second])
    assert.equal(decorated[0].series.status, "awaiting_leg1")
    assert.deepEqual(decorated[0].series.aggregate, [])

    const malformed = decoratePlayoffSeriesMatches(tournament, [first])
    assert.equal(malformed[0].series, undefined)
    assert.equal(malformed[0].seriesError.code, "PLAYOFF_CONFIGURATION_ERROR")
    assert.equal(malformed[0].mutation.canEditResult, false)
})

test("mutation locks use later legs and the canonical successor slot", () => {
    const [first, second] = buildLegsForTie({
        tournament,
        playoffId: 1,
        unitA: unit(1, "1A"),
        unitB: unit(2, "1B"),
    })
    second.played = true
    assert.equal(
        deriveMutationPolicy({ match: first, tieMatches: [first, second] })
            .reason,
        "later_leg_played"
    )

    second.played = false
    const successor = buildLegsForTie({
        tournament,
        playoffId: 17,
        unitA: unit(1, "1A"),
        unitB: null,
    }).reverse()
    assert.equal(
        deriveMutationPolicy({
            match: first,
            tieMatches: [first, second],
            successorMatches: successor,
            tournament,
        }).reason,
        "series_advanced"
    )
})

test("direct geometry requires 32 unique teams in 16 pairs", () => {
    const players = [player(1), player(2)]
    const teams = Array.from({ length: 32 }, (_, index) => ({
        team: team(index + 1),
        player: players[index % 2],
        playoff_id: Math.floor(index / 2) + 1,
    }))
    assert.equal(assertDirectPlayoffGeometry(teams, players), true)
    assert.throws(() => assertDirectPlayoffGeometry(teams.slice(1), players), {
        code: "INVALID_PLAYOFF_GEOMETRY",
    })
    assert.throws(
        () =>
            assertDirectPlayoffGeometry(
                teams.map((entry, index) =>
                    index === 31 ? { ...entry, team: teams[0].team } : entry
                ),
                players
            ),
        { code: "INVALID_PLAYOFF_GEOMETRY" }
    )
})
