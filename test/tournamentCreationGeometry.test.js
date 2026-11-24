const assert = require("node:assert/strict")
const test = require("node:test")
const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")

const validate = (body) => {
    const request = { body, query: {} }
    return new Promise((resolve) =>
        validateRequest(schemas.createTournament)(request, {}, (error) =>
            resolve({ error, request })
        )
    )
}

const reference = (id, prefix) => ({ id: String(id), name: `${prefix} ${id}` })
const validBody = () => {
    const players = [reference(1, "Player"), reference(2, "Player")]
    return {
        format: "playoff",
        name: "Copa",
        gameVersion: "FC 27",
        players,
        teams: Array.from({ length: 32 }, (_, index) => ({
            team: reference(index + 1, "Team"),
            player: players[index % 2],
            playoff_id: Math.floor(index / 2) + 1,
        })),
    }
}

test("playoff creation defaults mode and validates exact geometry", async () => {
    const { error, request } = await validate(validBody())
    assert.equal(error, undefined)
    assert.equal(request.body.playoffMode, "single")

    const invalid = validBody()
    invalid.teams.pop()
    assert.equal((await validate(invalid)).error.code, "VALIDATION_ERROR")
})

test("la versión del juego es obligatoria y solo acepta ediciones con overall cargado", async () => {
    const missing = validBody()
    delete missing.gameVersion
    assert.equal((await validate(missing)).error.code, "VALIDATION_ERROR")

    for (const gameVersion of ["FC 99", "fc 27", "", 27]) {
        const body = validBody()
        body.gameVersion = gameVersion
        assert.equal(
            (await validate(body)).error?.code,
            "VALIDATION_ERROR",
            String(gameVersion)
        )
    }

    for (const gameVersion of ["FC 27", "FC 26", "FIFA 19", " FC 27 "]) {
        const body = validBody()
        body.gameVersion = gameVersion
        const { error, request } = await validate(body)
        assert.equal(error, undefined, gameVersion)
        assert.equal(request.body.gameVersion, gameVersion.trim())
    }
})

test("playoff mode is forbidden for other formats", async () => {
    const body = validBody()
    body.format = "league"
    body.playoffMode = "two_legged"
    assert.equal((await validate(body)).error.code, "VALIDATION_ERROR")
})
