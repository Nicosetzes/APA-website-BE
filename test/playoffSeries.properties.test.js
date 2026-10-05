const assert = require("node:assert/strict")
const test = require("node:test")
const {
    buildLegsForTie,
    calculateSeriesState,
    getSuccessorDescriptor,
    sameUnit,
    toCompetitorUnit,
} = require("../service/playoffSeries")

const ref = (id, label) => ({ id: String(id), name: `${label} ${id}` })
const unit = (id, seed) => ({
    team: ref(id, "Team"),
    player: ref((id % 4) + 1, "Player"),
    seed,
})
const tournament = {
    id: "t",
    name: "Copa",
    format: "playoff",
    playoffMode: "two_legged",
}

for (let seed = 1; seed <= 25; seed += 1) {
    test(`inversion and aggregate properties seed=${seed}`, () => {
        const left = unit(seed * 2, `${seed}A`)
        const right = unit(seed * 2 + 1, `${seed}B`)
        const [first, second] = buildLegsForTie({
            tournament,
            playoffId: (seed % 16) + 1,
            unitA: left,
            unitB: right,
        })
        assert(sameUnit(toCompetitorUnit(first, "P1"), left))
        assert(sameUnit(toCompetitorUnit(second, "P2"), left))

        Object.assign(first, {
            played: true,
            scoreP1: seed % 5,
            scoreP2: (seed + 1) % 5,
        })
        Object.assign(second, {
            played: true,
            scoreP1: (seed + 2) % 5,
            scoreP2: (seed + 3) % 5,
        })
        const state = calculateSeriesState([first, second])
        const leftExpected = first.scoreP1 + second.scoreP2
        const rightExpected = first.scoreP2 + second.scoreP1
        assert.deepEqual(state.aggregate, [
            { teamId: left.team.id, score: leftExpected },
            { teamId: right.team.id, score: rightExpected },
        ])
        assert.equal(
            state.status === "awaiting_tiebreak",
            leftExpected === rightExpected
        )
    })
}

test("every source descriptor maps two adjacent feeders to one destination", () => {
    for (let source = 1; source <= 30; source += 2) {
        const left = getSuccessorDescriptor(source)
        const right = getSuccessorDescriptor(source + 1)
        assert.equal(left.destinationPlayoffId, right.destinationPlayoffId)
        assert.equal(left.logicalSide, "P1")
        assert.equal(right.logicalSide, "P2")
    }
})
