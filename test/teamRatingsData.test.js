const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const {
    ARTIFACT_PATH,
    buildArtifact,
    formatArtifact,
    parseCsv,
    readSources,
    validateSources,
} = require("../scripts/lib/teamRatingsData")
const {
    createTeamStrengthLookup,
    defaultTeamStrength,
    summarizeCoverage,
} = require("../service/playerRatings/teamStrength")

const TEAM_HEADER =
    "teamId,teamName,edition,matches,tournaments,overall,attack,midfield,defence,capturedAt"
const TOURNAMENT_HEADER =
    "tournamentId,tournamentName,format,startedAt,firstMatchAt,lastMatchAt,matches,inexactDates,edition"

const TOURNAMENT_ID = "64697ac9d542ff4ada3038d3"

const teamCsv = (...lines) => [TEAM_HEADER, ...lines].join("\n")
const tournamentCsv = (...lines) => [TOURNAMENT_HEADER, ...lines].join("\n")
const tournamentLine = (
    id = TOURNAMENT_ID,
    edition = "FIFA 19",
    name = "Chempions"
) => `${id},${name},champions_league,2019-07-09,,,10,0,${edition}`

const validate = (teams, tournaments) =>
    validateSources({
        teamRows: parseCsv(teams),
        tournamentRows: parseCsv(tournaments),
    })

const GOOD_TEAM = "157,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-09-11"

test("el JSON generado coincide con los CSV (si falla: npm run build:team-ratings)", () => {
    const expected = buildArtifact(readSources())
    const committed = require("../data/teamRatings.json")

    assert.deepEqual(
        committed,
        expected,
        "data/teamRatings.json está desactualizado respecto de los CSV: correr `npm run build:team-ratings`"
    )
})

test("el JSON generado tiene el formato de Prettier", () => {
    const text = fs.readFileSync(ARTIFACT_PATH, "utf8")
    assert.equal(
        text.replace(/\r\n/g, "\n"),
        formatArtifact(JSON.parse(text)).replace(/\r\n/g, "\n")
    )
})

test("los CSV reales no tienen errores de validación", () => {
    const { errors } = validateSources(readSources())
    assert.deepEqual(errors, [])
})

test("el parser quita el BOM y acepta CRLF y LF", () => {
    const rows = parseCsv("\uFEFFa,b\r\n1,2\r\n3,4\r\n")
    assert.deepEqual(rows.headers, ["a", "b"])
    assert.deepEqual(
        rows.map((row) => ({ ...row })),
        [
            { a: "1", b: "2" },
            { a: "3", b: "4" },
        ]
    )
    assert.deepEqual(
        parseCsv("a,b\n1,2\n3,4").map((row) => ({ ...row })),
        rows.map((row) => ({ ...row }))
    )
    assert.equal(parseCsv("a,b\n1,2\n3,4")[1].line, 3)
})

test("el parser maneja comillas con comas, comillas escapadas y vacíos", () => {
    const rows = parseCsv(
        'name,note,empty\n"Real Madrid, CF","dijo ""hola""",\n"multi\nlinea",x,y\n'
    )
    assert.equal(rows[0].name, "Real Madrid, CF")
    assert.equal(rows[0].note, 'dijo "hola"')
    assert.equal(rows[0].empty, "")
    assert.equal(rows[1].name, "multi\nlinea")
    assert.equal(rows[1].empty, "y")
    assert.equal(rows.length, 2)
})

test("el parser rechaza filas con columnas de más o de menos y comillas sin cerrar", () => {
    assert.throws(() => parseCsv("a,b\n1,2,3"), /línea 2 tiene 3 columnas/)
    assert.throws(() => parseCsv("a,b\n1"), /línea 2 tiene 1 columnas/)
    assert.throws(() => parseCsv('a,b\n"1,2'), /comillas sin cerrar/)
})

test("buildArtifact ordena las claves y omite los overall vacíos", () => {
    const artifact = buildArtifact({
        teamRows: parseCsv(
            teamCsv(
                "9,Zeta,FIFA 19,1,1,70,70,70,70,2019-09-11",
                "157,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-09-11",
                "5,Vacio,FIFA 19,1,1,,,,,2019-09-11"
            )
        ),
        tournamentRows: parseCsv(
            tournamentCsv(
                tournamentLine("bbbbbbbbbbbbbbbbbbbbbbbb", "FIFA 19"),
                tournamentLine("aaaaaaaaaaaaaaaaaaaaaaaa", "FIFA 19")
            )
        ),
    })

    assert.deepEqual(Object.keys(artifact.overallByTeamEdition), [
        "157|FIFA 19",
        "9|FIFA 19",
    ])
    assert.deepEqual(Object.keys(artifact.editionByTournament), [
        "aaaaaaaaaaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbbbbbbbbbb",
    ])
    assert.equal(artifact.overallByTeamEdition["157|FIFA 19"], 85)
})

test("el validador acepta datos correctos", () => {
    const { errors, warnings } = validate(
        teamCsv(GOOD_TEAM),
        tournamentCsv(tournamentLine())
    )
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
})

test("el validador detecta duplicados, rangos, fechas y filas parciales", () => {
    const cases = [
        [
            [GOOD_TEAM, GOOD_TEAM],
            /duplicada con la línea 2/,
            "duplicado teamId|edition",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,100,85,85,85,2019-09-11"],
            /overall inválido/,
            "overall fuera de rango",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,39,85,85,85,2019-09-11"],
            /overall inválido/,
            "overall bajo el mínimo",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85.5,85,85,85,2019-09-11"],
            /overall inválido/,
            "overall decimal",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-02-30"],
            /capturedAt inválida/,
            "fecha inexistente",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85,85,85,85,11/09/2019"],
            /capturedAt inválida/,
            "fecha con otro formato",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85,85,,85,2019-09-11"],
            /falta midfield/,
            "fila parcial",
        ],
        [
            ["157,Bayern Munich,FIFA19,12,1,85,85,85,85,2019-09-11"],
            /edition con formato inesperado/,
            "edición mal escrita",
        ],
        [
            ["x,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-09-11"],
            /teamId inválido/,
            "teamId no entero",
        ],
    ]

    for (const [lines, pattern, label] of cases) {
        const { errors } = validate(
            teamCsv(...lines),
            tournamentCsv(tournamentLine())
        )
        assert.ok(
            errors.some((error) => pattern.test(error)),
            `${label}: ${JSON.stringify(errors)}`
        )
    }
})

test("una fila totalmente vacía es solo un aviso y no entra al artefacto", () => {
    const teams = teamCsv(GOOD_TEAM, "5,Sin datos,FIFA 19,1,1,,,,,2019-09-11")
    const { errors, warnings } = validate(
        teams,
        tournamentCsv(tournamentLine())
    )

    assert.deepEqual(errors, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Sin datos/)
    assert.deepEqual(
        Object.keys(
            buildArtifact({
                teamRows: parseCsv(teams),
                tournamentRows: parseCsv(tournamentCsv(tournamentLine())),
            }).overallByTeamEdition
        ),
        ["157|FIFA 19"]
    )
})

test("el validador avisa si el overall se aleja del promedio de las líneas", () => {
    const { errors, warnings } = validate(
        teamCsv("157,Bayern Munich,FIFA 19,12,1,85,75,75,75,2019-09-11"),
        tournamentCsv(tournamentLine())
    )
    assert.deepEqual(errors, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /lejos del promedio/)
})

test("el validador exige edición conocida en cada torneo y avisa de ediciones sin torneo", () => {
    const withoutEdition = validate(
        teamCsv(GOOD_TEAM),
        tournamentCsv(tournamentLine(TOURNAMENT_ID, ""))
    )
    assert.ok(withoutEdition.errors.some((error) => /sin edición/.test(error)))

    const unknownEdition = validate(
        teamCsv(GOOD_TEAM),
        tournamentCsv(tournamentLine(TOURNAMENT_ID, "FC 27"))
    )
    assert.ok(
        unknownEdition.errors.some((error) =>
            /"FC 27" no tiene equipos/.test(error)
        )
    )

    const unusedEdition = validate(
        teamCsv(
            GOOD_TEAM,
            "157,Bayern Munich,FC 25,12,1,86,86,86,86,2025-09-11"
        ),
        tournamentCsv(tournamentLine())
    )
    assert.deepEqual(unusedEdition.errors, [])
    assert.ok(
        unusedEdition.warnings.some((warning) =>
            /"FC 25" tiene equipos pero ningún torneo/.test(warning)
        )
    )

    const duplicated = validate(
        teamCsv(GOOD_TEAM),
        tournamentCsv(tournamentLine(), tournamentLine())
    )
    assert.ok(
        duplicated.errors.some((error) => /tournamentId duplicado/.test(error))
    )

    const badId = validate(
        teamCsv(GOOD_TEAM),
        tournamentCsv(tournamentLine("abc"))
    )
    assert.ok(badId.errors.some((error) => /tournamentId inválido/.test(error)))
})

test("el validador detecta encabezados distintos de los esperados", () => {
    const { errors } = validateSources({
        teamRows: parseCsv("teamId,teamName\n1,A"),
        tournamentRows: parseCsv(tournamentCsv(tournamentLine())),
    })
    assert.ok(errors.some((error) => /encabezados inesperados/.test(error)))
})

const DATA = {
    editionByTournament: { [TOURNAMENT_ID]: "FIFA 19" },
    overallByTeamEdition: { "157|FIFA 19": 85, "197|FIFA 19": 77 },
}
const lookup = createTeamStrengthLookup(DATA)
const matchOf = (extra = {}) => ({
    tournament: { id: TOURNAMENT_ID, name: "Chempions" },
    teamP1: { id: 157, name: "Bayern Munich" },
    teamP2: { id: 197, name: "PSV Eindhoven" },
    ...extra,
})

test("el lookup devuelve los overall de ambos equipos", () => {
    assert.deepEqual(lookup(matchOf()), { t1: 85, t2: 77 })
})

test("el lookup compara ids como string: número, string y objeto con toString", () => {
    assert.deepEqual(
        lookup(matchOf({ teamP1: { id: "157" }, teamP2: { id: "197" } })),
        { t1: 85, t2: 77 }
    )
    assert.deepEqual(
        lookup(
            matchOf({
                tournament: { id: { toString: () => TOURNAMENT_ID } },
            })
        ),
        { t1: 85, t2: 77 }
    )
})

test("el lookup devuelve null si falta cualquier dato", () => {
    assert.equal(
        lookup(matchOf({ tournament: { id: "ffffffffffffffffffffffff" } })),
        null,
        "torneo desconocido"
    )
    assert.equal(
        lookup(matchOf({ teamP2: { id: 999 } })),
        null,
        "equipo sin rating"
    )
    assert.equal(
        lookup(matchOf({ teamP1: { id: 999 } })),
        null,
        "equipo sin rating"
    )
    assert.equal(lookup(matchOf({ tournament: undefined })), null)
    assert.equal(lookup(matchOf({ tournament: {} })), null)
    assert.equal(lookup(matchOf({ teamP1: undefined })), null)
    assert.equal(lookup(matchOf({ teamP2: { name: "sin id" } })), null)
    assert.equal(lookup(matchOf({ teamP1: { id: null } })), null)
    assert.equal(lookup({}), null)
    assert.equal(lookup(undefined), null)
})

test("el lookup ignora overall que no son números finitos", () => {
    const strict = createTeamStrengthLookup({
        editionByTournament: DATA.editionByTournament,
        overallByTeamEdition: {
            "157|FIFA 19": "85",
            "197|FIFA 19": null,
            "1|FIFA 19": Number.NaN,
            "2|FIFA 19": 70,
        },
    })
    assert.equal(strict(matchOf()), null)
    assert.equal(
        strict(matchOf({ teamP1: { id: 2 }, teamP2: { id: 1 } })),
        null
    )
})

test("el lookup exige objetos para armarse", () => {
    assert.throws(() => createTeamStrengthLookup(), /editionByTournament/)
    assert.throws(
        () =>
            createTeamStrengthLookup({
                editionByTournament: {},
                overallByTeamEdition: [],
            }),
        /overallByTeamEdition/
    )
})

test("summarizeCoverage cuenta partidos cubiertos y lista lo que falta", () => {
    const matches = [
        matchOf(),
        matchOf(),
        matchOf({ teamP2: { id: 999, name: "Nuevo FC" } }),
        matchOf({
            tournament: { id: "ffffffffffffffffffffffff", name: "Nuevo" },
        }),
        { teamP1: { id: 157 } },
    ]

    const coverage = summarizeCoverage(matches, DATA)
    assert.equal(coverage.total, 5)
    assert.equal(coverage.covered, 2)
    assert.deepEqual(coverage.tournamentsWithoutEdition, [
        {
            tournamentId: "ffffffffffffffffffffffff",
            name: "Nuevo",
            matches: 1,
        },
    ])
    assert.deepEqual(coverage.missingPairs, [
        { teamId: "999", teamName: "Nuevo FC", edition: "FIFA 19", matches: 1 },
    ])
})

test("el runtime carga el JSON con un require plano, sin fs ni variables de entorno", () => {
    const source = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "service",
            "playerRatings",
            "teamStrength.js"
        ),
        "utf8"
    )

    assert.ok(source.includes('require("../../data/teamRatings.json")'))
    assert.ok(!/require\(["'](node:)?fs["']\)/.test(source))
    assert.ok(!source.includes("process.env"))
    assert.ok(!source.includes("NODE_ENV"))
    assert.ok(!source.includes("VERCEL"))
})

test("el lookup por defecto resuelve un par real tomado del JSON", () => {
    const data = require("../data/teamRatings.json")
    const [key, overall] = Object.entries(data.overallByTeamEdition)[0]
    const [teamId, edition] = key.split("|")
    const tournamentId = Object.entries(data.editionByTournament).find(
        ([, value]) => value === edition
    )[0]

    const result = defaultTeamStrength({
        tournament: { id: tournamentId },
        teamP1: { id: Number(teamId) },
        teamP2: { id: String(teamId) },
    })
    assert.deepEqual(result, { t1: overall, t2: overall })
})

test("todos los torneos del CSV tienen edición en el JSON y viceversa", () => {
    const { tournamentRows } = readSources()
    const data = require("../data/teamRatings.json")
    assert.equal(
        Object.keys(data.editionByTournament).length,
        tournamentRows.length
    )
    for (const row of tournamentRows) {
        assert.equal(data.editionByTournament[row.tournamentId], row.edition)
    }
})

test("npm run check:team-ratings (offline) termina bien con los datos reales", () => {
    const output = execFileSync(
        process.execPath,
        [path.join(__dirname, "..", "scripts", "checkTeamRatings.js")],
        { encoding: "utf8" }
    )
    assert.match(output, /Errores \(0\)/)
    assert.match(output, /Datos de fuerza de equipo OK/)
})
