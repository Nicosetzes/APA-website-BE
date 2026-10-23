process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const test = require("node:test")

const tournamentRecapsModel = require("../dao/models/tournamentRecaps")

const validDocument = () => ({
    tournamentId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    tournament: "Superliga Internacional 2025",
    format: "league_playin_playoff",
    closedAt: new Date("2025-12-29T22:00:00.000Z"),
    headline: "Nico levantó su cuarta Superliga",
    summary: "Una bajada.",
    recap: "## El campeón\nTexto",
    generation: {
        model: "claude-sonnet-5-5",
        promptVersion: "tournament-recap-v1",
        contextVersion: "tournament-recap-2",
        ratingVersion: "2.0",
        drawModelVersion: "draw-1",
        contextHash: "abc123",
    },
    createdAt: new Date("2026-10-22T12:00:00.000Z"),
})

test("tournament recap accepts a complete document and applies defaults", () => {
    const document = new tournamentRecapsModel(validDocument())

    assert.equal(document.validateSync(), undefined)
    assert.equal(document.language, "es-AR")
    assert.equal(document.image, null)
})

test("tournament recap does not default revision (the upsert uses $inc)", () => {
    const document = new tournamentRecapsModel(validDocument())

    assert.equal(document.revision, undefined)
    assert.equal(
        tournamentRecapsModel.schema.path("revision").defaultValue,
        undefined
    )
})

test("tournament recap requires its identifying and text fields", () => {
    for (const field of [
        "tournamentId",
        "tournament",
        "headline",
        "summary",
        "recap",
        "generation",
        "createdAt",
    ]) {
        const document = new tournamentRecapsModel(validDocument())
        document[field] = undefined

        assert.ok(
            document.validateSync()?.errors[field],
            `${field} should be required`
        )
    }
})

test("tournament recap enforces the text limits", () => {
    const tooLong = (field, length) => {
        const document = new tournamentRecapsModel({
            ...validDocument(),
            [field]: "x".repeat(length),
        })

        return Boolean(document.validateSync()?.errors[field])
    }

    assert.equal(tooLong("headline", 141), true)
    assert.equal(tooLong("headline", 140), false)
    assert.equal(tooLong("summary", 501), true)
    assert.equal(tooLong("summary", 500), false)
    assert.equal(tooLong("recap", 50001), true)
    assert.equal(tooLong("recap", 50000), false)
})

test("tournament recap requires every generation field", () => {
    for (const field of Object.keys(validDocument().generation)) {
        const generation = { ...validDocument().generation }
        delete generation[field]
        const document = new tournamentRecapsModel({
            ...validDocument(),
            generation,
        })

        assert.ok(
            document.validateSync()?.errors[`generation.${field}`],
            `generation.${field} should be required`
        )
    }
})

test("tournament recap has a unique index on tournamentId", () => {
    const index = tournamentRecapsModel.schema
        .indexes()
        .find(
            ([, options]) =>
                options.name === "uniq_tournament_recap_tournament_v1"
        )

    assert.ok(index)
    assert.deepEqual(index[0], { tournamentId: 1 })
    assert.equal(index[1].unique, true)
    assert.equal(tournamentRecapsModel.collection.name, "tournament-recaps")
})

test("tournament recap keeps updatedAt automatic and createdAt manual", () => {
    const { timestamps } = tournamentRecapsModel.schema.options

    assert.deepEqual(timestamps, { createdAt: false, updatedAt: true })
})
