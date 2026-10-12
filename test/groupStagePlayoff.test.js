const assert = require("node:assert/strict")
const test = require("node:test")

const calculateGroupStagePlayoff = require("../service/calculateGroupStagePlayoff")

const GROUPS = ["A", "B", "C", "D", "E", "F"]

// Por grupo: el 1° le gana al 2° por `s`, al 3° por `k`, y el 2° le gana al 3°
// por `m`. Así el 3° siempre termina con 0 puntos y diferencia -(k + m), y el
// 1° con diferencia s + k.
const MARGINS = {
    A: { s: 1, k: 1, m: 1 },
    B: { s: 1, k: 2, m: 1 },
    C: { s: 1, k: 1, m: 3 },
    D: { s: 1, k: 2, m: 3 },
    E: { s: 3, k: 1, m: 5 },
    F: { s: 1, k: 4, m: 3 },
}

const buildTournament = () => {
    const teams = {}
    const regularMatches = []

    for (const group of GROUPS) {
        const [t1, t2, t3] = [1, 2, 3].map((n) => ({
            team: { id: `${group}${n}`, name: `${group}${n}` },
            player: { id: `p${group}${n}`, name: `p${group}${n}` },
        }))
        teams[group] = [t3, t1, t2]

        const { s, k, m } = MARGINS[group]
        const win = (winner, loser, margin) =>
            regularMatches.push({
                played: true,
                teamP1: winner.team,
                scoreP1: margin,
                teamP2: loser.team,
                scoreP2: 0,
                outcome: { draw: false, teamThatWon: winner.team },
            })

        win(t1, t2, s)
        win(t1, t3, k)
        win(t2, t3, m)
    }

    return { teams, regularMatches }
}

test("super_cup ranks the thirds like a standings table and pairs them with the firsts", () => {
    const { teams, regularMatches } = buildTournament()

    const { thirdsTable, playoffMatches } = calculateGroupStagePlayoff(
        teams,
        regularMatches,
        "super_cup"
    )

    assert.deepEqual(
        thirdsTable.map(({ group, rank, qualified }) => [
            group,
            rank,
            qualified,
        ]),
        [
            ["A", 1, true],
            ["B", 2, true],
            ["C", 3, true],
            ["D", 4, true],
            ["E", 5, false],
            ["F", 6, false],
        ]
    )

    // Firsts que reciben un tercero, del mejor al peor: F, E, B, C. El mejor
    // enfrenta al peor tercero clasificado (D); B no puede jugar contra B3 y
    // toma A3.
    const seeds = playoffMatches.map(({ seedP1, seedP2 }) => [seedP1, seedP2])
    assert.deepEqual(seeds[0], ["1B", "3A"])
    assert.deepEqual(seeds[2], ["1F", "3D"])
    assert.deepEqual(seeds[4], ["1E", "3C"])
    assert.deepEqual(seeds[6], ["1C", "3B"])
})
