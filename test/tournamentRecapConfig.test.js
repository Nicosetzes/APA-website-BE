process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
    BACKFILL_EXCLUDED_TOURNAMENTS,
    checkRecapCoherence,
    getCompetition,
    getRequiredRecapSections,
} = require("../config/tournamentRecap")
const { describeTournamentFormat } = require("../config/tournamentFormatRules")
const { getPlayoffRoundForId } = require("../config/playoffFormats")

// Los 24 torneos del inventario de PROD (filas 1 a 24): nombre, formato real y
// familia esperada. La familia sale solo del formato.
const PROD_TOURNAMENTS = [
    ["Torneo Argentino 2021/22", "league", "Liga"],
    ["Superliga Europea 2022", "league_playin_playoff", "Superliga"],
    ["Copa del Mundo 2022", "world_cup", "Mundial"],
    ["Superliga ítalo-española 2022/23", "league", "Liga"],
    ["Superliga Inglesa 2022", "league_playin_playoff", "Superliga"],
    ["Chempions 2019/20", "champions_league", "Champions"],
    ["Superliga Argentina 2023", "league_playin_playoff", "Superliga"],
    [
        "Superliga Internacional 2023/24 (I)",
        "league_playin_playoff",
        "Superliga",
    ],
    [
        "Superliga Internacional 2023/24 (II)",
        "league_playin_playoff",
        "Superliga",
    ],
    ["Superliga Inglesa 2024", "league_playin_playoff", "Superliga"],
    ["Chempions 2024", "champions_league", "Champions"],
    ["Mundial de Ferraris 2024/25", "world_cup", "Mundial"],
    ["Superliga Internacional 2025", "league_playin_playoff", "Superliga"],
    ["Copa Argentina 2025/26", "playoff", "Eliminatoria"],
    ["Liga Inglesa 2026", "league", "Liga"],
    ["Torneo Argentino 2016", "league", "Liga"],
    ["Torneo Argentino 2017", "league", "Liga"],
    ["Copa del Mundo 2017", "world_cup", "Mundial"],
    ["Torneo Argentino 2018", "league", "Liga"],
    ["Copa del Mundo 2018", "world_cup", "Mundial"],
    ["Copa del Mundo 2018 (Juego Oficial)", "world_cup", "Mundial"],
    ["Mundial de Clubes 2018", "club_world_cup", "Mundial de Clubes"],
    ["Copa Argentina 2018", "playoff", "Eliminatoria"],
    // Hoy en PROD figura como `playoff`; el formato propio es `american_cup`.
    ["Copa América 2019", "american_cup", "Copa América"],
]

test("getCompetition maps the format of every PROD tournament to its family", () => {
    for (const [name, format, label] of PROD_TOURNAMENTS) {
        const competition = getCompetition({ name, format })

        assert.equal(competition.label, label, name)
        assert.equal(competition.known, true, name)
    }
})

test("the family ignores the tournament name", () => {
    // Mismo formato, nombres distintos: la misma familia.
    const names = [
        "Superliga Europea 2022",
        "Superliga Inglesa 2024",
        "Superliga Argentina 2023",
        "Superliga Internacional 2025",
        "Cualquier otro nombre",
    ]

    for (const name of names) {
        assert.deepEqual(
            getCompetition({ name, format: "league_playin_playoff" }),
            {
                key: "league_playin_playoff",
                label: "Superliga",
                known: true,
            }
        )
    }
    // Un nombre "Superliga" con otro formato no es Superliga.
    assert.equal(
        getCompetition({
            name: "Superliga ítalo-española 2022/23",
            format: "league",
        }).label,
        "Liga"
    )
    assert.equal(
        getCompetition({ name: "Copa Afinidades 2026", format: "playoff" })
            .label,
        "Eliminatoria"
    )
})

test("getCompetition has a label for every tournament format", () => {
    const expected = {
        league: ["league", "Liga"],
        league_playin_playoff: ["league_playin_playoff", "Superliga"],
        playoff: ["playoff", "Eliminatoria"],
        world_cup: ["world_cup", "Mundial"],
        world_cup_2026: ["world_cup", "Mundial"],
        champions_league: ["champions_league", "Champions"],
        super_cup: ["super_cup", "Supercopa"],
        american_cup: ["american_cup", "Copa América"],
        club_world_cup: ["club_world_cup", "Mundial de Clubes"],
    }

    for (const [format, [key, label]] of Object.entries(expected)) {
        assert.deepEqual(
            getCompetition({ format }),
            { key, label, known: true },
            format
        )
    }
})

test("the legacy formats american_cup and club_world_cup are described and need no fallback", () => {
    for (const format of ["american_cup", "club_world_cup"]) {
        const rules = describeTournamentFormat({ format })
        assert.equal(typeof rules.description, "string", format)
        assert.ok(rules.description.length > 0, format)
        assert.deepEqual(rules.stages, [], format)
        assert.equal(rules.tableTiebreak, null, format)
        assert.equal(rules.qualification, null, format)
        assert.equal(rules.knockout, null, format)
        // Sin etapas conocidas el recap solo exige el campeón y la historia.
        assert.deepEqual(getRequiredRecapSections(rules), [
            ["El campeón"],
            ["En la historia"],
        ])
    }
    assert.match(
        describeTournamentFormat({ format: "american_cup" }).description,
        /Copa América/
    )
    assert.match(
        describeTournamentFormat({ format: "club_world_cup" }).description,
        /Mundial de Clubes/
    )
})
test("an unknown or missing format falls back to a generic label and is flagged", () => {
    assert.deepEqual(getCompetition({ format: "league_two_groups" }), {
        key: "league_two_groups",
        label: "Torneo de formato league two groups",
        known: false,
    })
    for (const tournament of [
        {},
        { format: null },
        { format: "  " },
        undefined,
    ]) {
        assert.deepEqual(getCompetition(tournament), {
            key: "unknown",
            label: "Torneo de formato desconocido",
            known: false,
        })
    }
    // Una clave heredada del prototipo no es un formato.
    assert.equal(getCompetition({ format: "constructor" }).known, false)
})

test("BACKFILL_EXCLUDED_TOURNAMENTS leaves out Chempions 2019/20 by id", () => {
    assert.deepEqual(BACKFILL_EXCLUDED_TOURNAMENTS, {
        "64697ac9d542ff4ada3038d3": "Chempions 2019/20",
    })
})

test("getRequiredRecapSections follows the stages of each format", () => {
    const sectionsOf = (format) =>
        getRequiredRecapSections(describeTournamentFormat({ format }))

    assert.deepEqual(sectionsOf("league"), [
        ["El campeón"],
        ["Fase regular", "Fase de grupos"],
        ["En la historia"],
    ])
    assert.deepEqual(sectionsOf("league_playin_playoff"), [
        ["El campeón"],
        ["Fase regular", "Fase de grupos"],
        ["Play-in"],
        ["Playoffs"],
        ["En la historia"],
    ])
    assert.deepEqual(sectionsOf("playoff"), [
        ["El campeón"],
        ["Playoffs"],
        ["En la historia"],
    ])
    for (const format of [
        "world_cup",
        "world_cup_2026",
        "champions_league",
        "super_cup",
    ]) {
        assert.deepEqual(sectionsOf(format), [
            ["El campeón"],
            ["Fase regular", "Fase de grupos"],
            ["Playoffs"],
            ["En la historia"],
        ])
    }
})

const result = {
    champion: {
        player: { name: "Nico" },
        team: { name: "Liverpool" },
    },
    runnerUp: {
        player: { name: "Max" },
        team: { name: "Chelsea" },
    },
}

const fullRecap = [
    "## El campeón",
    "Nico con Liverpool.",
    "## Fase de grupos",
    "Texto.",
    "## Playoffs",
    "Final contra Max y Chelsea.",
    "## En la historia",
    "Cierre.",
].join("\n")

const rules = describeTournamentFormat({ format: "world_cup" })

test("checkRecapCoherence accepts a complete recap", () => {
    assert.deepEqual(checkRecapCoherence({ recap: fullRecap, result, rules }), {
        ok: true,
        missingSections: [],
        missingNames: [],
    })
})

test("checkRecapCoherence lists missing sections and names", () => {
    const check = checkRecapCoherence({
        recap: "## El campeón\nSolo Nico.\n## Playoffs\nTexto",
        result,
        rules,
    })

    assert.equal(check.ok, false)
    assert.deepEqual(check.missingSections, [
        "Fase regular / Fase de grupos",
        "En la historia",
    ])
    assert.deepEqual(check.missingNames, [
        "campeón (equipo): Liverpool",
        "subcampeón (jugador): Max",
        "subcampeón (equipo): Chelsea",
    ])
})

test("checkRecapCoherence matches headings by prefix without accents or case", () => {
    const check = checkRecapCoherence({
        recap: fullRecap
            .replace("## El campeón", "## EL CAMPEON del torneo")
            .replace("## Fase de grupos", "## Fase regular: la tabla"),
        result,
        rules,
    })

    assert.equal(check.ok, true)
    // Un título de nivel 3 o un texto suelto no cuenta como sección.
    assert.equal(
        checkRecapCoherence({
            recap: fullRecap.replace("## Playoffs", "### Playoffs"),
            result,
            rules,
        }).ok,
        false
    )
})

test("checkRecapCoherence checks a player who is champion and runner-up once", () => {
    const samePlayer = {
        champion: { player: { name: "Max" }, team: { name: "San Lorenzo" } },
        runnerUp: { player: { name: "Max" }, team: { name: "River Plate" } },
    }
    const recap = [
        "## El campeón",
        "Max con San Lorenzo, a River Plate.",
        "## Fase regular",
        "x",
        "## Play-in",
        "x",
        "## Playoffs",
        "x",
        "## En la historia",
        "x",
    ].join("\n")
    const leaguePlayin = describeTournamentFormat({
        format: "league_playin_playoff",
    })
    const missingBoth = checkRecapCoherence({
        recap: recap.replace("Max con", "Él con"),
        result: samePlayer,
        rules: leaguePlayin,
    })

    assert.equal(
        checkRecapCoherence({ recap, result: samePlayer, rules: leaguePlayin })
            .ok,
        true
    )
    assert.deepEqual(missingBoth.missingNames, ["campeón (jugador): Max"])
})

test("checkRecapCoherence accepts any of the aliases of a name", () => {
    const aliased = {
        ...result,
        champion: {
            ...result.champion,
            player: { name: "Max", aliases: ["Maxi"] },
        },
    }

    assert.equal(
        checkRecapCoherence({
            recap: fullRecap.replace("Nico", "Maxi").replace("Max y", "Nico y"),
            result: {
                ...aliased,
                runnerUp: { ...aliased.runnerUp, player: { name: "Nico" } },
            },
            rules,
        }).ok,
        true
    )
})

test("getPlayoffRoundForId resolves the round of each bracket geometry", () => {
    assert.equal(getPlayoffRoundForId("playoff", 1), "round_of_32")
    assert.equal(getPlayoffRoundForId("playoff", 17), "round_of_16")
    assert.equal(getPlayoffRoundForId("playoff", 31), "final")
    assert.equal(getPlayoffRoundForId("champions_league", 29), "final")
    assert.equal(getPlayoffRoundForId("champions_league", 17), "quarterfinal")
    assert.equal(
        getPlayoffRoundForId("league_playin_playoff", 1),
        "round_of_16"
    )
    assert.equal(getPlayoffRoundForId("league_playin_playoff", 15), "final")
    assert.equal(getPlayoffRoundForId("world_cup", 9), "quarterfinal")
    // Fuera de todos los rangos.
    assert.equal(getPlayoffRoundForId("world_cup", 99), null)
    assert.equal(getPlayoffRoundForId("playoff", 0), null)
})
