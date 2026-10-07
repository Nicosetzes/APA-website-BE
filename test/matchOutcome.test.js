const assert = require("node:assert/strict")
const test = require("node:test")

const {
    recomputeOutcomeParticipants,
    withRecomputedOutcome,
} = require("../utils/matchOutcome")

// Fixtures anonimizados de los dos casos reales de ganador desactualizado.
const playerA = { id: "player-a", name: "Player A" }
const playerB = { id: "player-b", name: "Player B" }

const playInCase = () => ({
    _id: "case-play-in",
    type: "playin",
    played: true,
    playerP1: playerA,
    teamP1: { id: "49", name: "Team 49" },
    seedP1: "7",
    scoreP1: 1,
    playerP2: playerB,
    teamP2: { id: "50", name: "Team 50" },
    seedP2: "8",
    scoreP2: 0,
    outcome: {
        playerThatWon: playerA,
        // El nombre coincide pero el id es de otro equipo.
        teamThatWon: { id: "66", name: "Team 49" },
        seedFromTeamThatWon: "7",
        scoreFromTeamThatWon: "1",
        playerThatLost: playerB,
        teamThatLost: { id: "50", name: "Team 50" },
        seedFromTeamThatLost: "8",
        scoreFromTeamThatLost: "0",
        draw: false,
        scoringDifference: 1,
    },
})

const playoffCase = () => ({
    _id: "case-playoff",
    type: "playoff",
    played: true,
    playerP1: playerA,
    teamP1: { id: 9568, name: "Team 9568" },
    seedP1: "3",
    scoreP1: 3,
    playerP2: playerB,
    teamP2: { id: 77, name: "Team 77" },
    seedP2: "14",
    scoreP2: 1,
    outcome: {
        playerThatWon: playerA,
        // Equipo que ya no juega el partido.
        teamThatWon: { id: 1137, name: "Team 1137" },
        seedFromTeamThatWon: "3",
        scoreFromTeamThatWon: 3,
        playerThatLost: playerB,
        teamThatLost: { id: 77, name: "Team 77" },
        seedFromTeamThatLost: "14",
        scoreFromTeamThatLost: 1,
        draw: false,
        scoringDifference: 2,
    },
})

test("P1 wins 1-0 with a teamThatWon of another id: fixed to teamP1", () => {
    const match = playInCase()
    const { outcome, changed } = recomputeOutcomeParticipants(match)

    assert.equal(changed, true)
    assert.deepEqual(outcome.teamThatWon, { id: "49", name: "Team 49" })
    assert.deepEqual(outcome.teamThatLost, match.teamP2)
    assert.deepEqual(outcome.playerThatWon, playerA)
    assert.deepEqual(outcome.playerThatLost, playerB)
    assert.equal(outcome.seedFromTeamThatWon, "7")
    assert.equal(outcome.seedFromTeamThatLost, "8")
    // Goles, empate y diferencia se conservan tal cual.
    assert.equal(outcome.scoreFromTeamThatWon, "1")
    assert.equal(outcome.scoreFromTeamThatLost, "0")
    assert.equal(outcome.draw, false)
    assert.equal(outcome.scoringDifference, 1)
    // Es puro.
    assert.equal(match.outcome.teamThatWon.id, "66")
})

test("P1 wins 3-1 with a team that no longer plays: fixed to teamP1", () => {
    const match = playoffCase()
    const { outcome, changed } = recomputeOutcomeParticipants(match)

    assert.equal(changed, true)
    assert.deepEqual(outcome.teamThatWon, { id: 9568, name: "Team 9568" })
    assert.deepEqual(outcome.teamThatLost, { id: 77, name: "Team 77" })
    assert.equal(outcome.scoreFromTeamThatWon, 3)
    assert.equal(outcome.scoringDifference, 2)
})

test("a penalty draw takes the winner side from outcome.playerThatWon", () => {
    const match = {
        played: true,
        playerP1: playerA,
        teamP1: { id: 1, name: "Team 1" },
        seedP1: "1",
        scoreP1: 2,
        playerP2: playerB,
        teamP2: { id: 2, name: "Team 2" },
        seedP2: "2",
        scoreP2: 2,
        outcome: {
            playerThatWon: playerB,
            teamThatWon: { id: 99, name: "Old team" },
            seedFromTeamThatWon: "2",
            scoreFromTeamThatWon: 5,
            playerThatLost: playerA,
            teamThatLost: { id: 1, name: "Team 1" },
            seedFromTeamThatLost: "1",
            scoreFromTeamThatLost: 4,
            draw: true,
            penalties: true,
        },
    }

    const { outcome, changed } = recomputeOutcomeParticipants(match)

    assert.equal(changed, true)
    assert.deepEqual(outcome.teamThatWon, match.teamP2)
    assert.deepEqual(outcome.teamThatLost, match.teamP1)
    assert.equal(outcome.scoreFromTeamThatWon, 5)
    assert.equal(outcome.draw, true)
    assert.equal(outcome.penalties, true)
})

test("a penalty draw between two teams of the same player uses the team", () => {
    const match = {
        played: true,
        playerP1: playerA,
        teamP1: { id: 1, name: "Team 1" },
        scoreP1: 0,
        playerP2: playerA,
        teamP2: { id: 2, name: "Team 2" },
        scoreP2: 0,
        outcome: {
            playerThatWon: playerA,
            teamThatWon: { id: "2", name: "Team 2" },
            playerThatLost: playerA,
            teamThatLost: { id: "1", name: "Team 1" },
            draw: true,
            penalties: true,
        },
    }

    const { changed } = recomputeOutcomeParticipants(match)

    assert.equal(changed, false)
})

test("unplayed matches, plain draws and consistent outcomes are unchanged", () => {
    const pending = { ...playoffCase(), played: false }
    const draw = {
        ...playoffCase(),
        scoreP1: 1,
        scoreP2: 1,
        outcome: { draw: true, penalties: false },
    }
    const fixed = playoffCase()
    fixed.outcome.teamThatWon = { id: "9568", name: "Team 9568" }

    for (const match of [pending, draw, fixed]) {
        const result = recomputeOutcomeParticipants(match)
        assert.equal(result.changed, false)
        assert.equal(result.outcome, match.outcome)
    }
    assert.deepEqual(recomputeOutcomeParticipants(null), {
        outcome: undefined,
        changed: false,
    })
})

test("regular matches without seeds do not gain seed fields", () => {
    const match = {
        played: true,
        playerP1: playerA,
        teamP1: { id: 1, name: "Team 1" },
        scoreP1: 2,
        playerP2: playerB,
        teamP2: { id: 2, name: "Team 2" },
        scoreP2: 0,
        outcome: {
            playerThatWon: playerB,
            teamThatWon: { id: 2, name: "Team 2" },
            scoreFromTeamThatWon: 2,
            playerThatLost: playerA,
            teamThatLost: { id: 1, name: "Team 1" },
            scoreFromTeamThatLost: 0,
            draw: false,
            scoringDifference: 2,
        },
    }

    const { outcome, changed } = recomputeOutcomeParticipants(match)

    assert.equal(changed, true)
    assert.deepEqual(outcome.playerThatWon, playerA)
    assert.equal("seedFromTeamThatWon" in outcome, false)
})

test("slot fields only carry an outcome when the destination is played", () => {
    const fields = {
        playerP1: playerA,
        teamP1: { id: 5, name: "Team 5" },
        seedP1: "5",
    }
    const pendingDest = { played: false, playerP1: null }
    assert.equal(withRecomputedOutcome(pendingDest, fields), fields)

    const plainDest = {
        played: true,
        playerP1: null,
        teamP1: null,
        seedP1: null,
        scoreP1: 2,
        playerP2: playerB,
        teamP2: { id: 6, name: "Team 6" },
        seedP2: "6",
        scoreP2: 1,
        outcome: {
            playerThatWon: null,
            teamThatWon: null,
            playerThatLost: playerB,
            teamThatLost: { id: 6, name: "Team 6" },
            draw: false,
            scoringDifference: 1,
        },
    }
    // Simula un documento de Mongoose.
    const playedDest = { ...plainDest, toObject: () => plainDest }

    const result = withRecomputedOutcome(playedDest, fields)
    assert.deepEqual(result.teamP1, fields.teamP1)
    assert.deepEqual(result.outcome.teamThatWon, fields.teamP1)
    assert.deepEqual(result.outcome.playerThatWon, playerA)
    assert.equal(result.outcome.seedFromTeamThatWon, "5")
})
