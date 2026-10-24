process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const matchesModel = require("../dao/models/matches")
const tournamentRecapsModel = require("../dao/models/tournamentRecaps")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const { RECAP_SECRET_HEADER } = require("../middleware/requireRecapSecret")
const { RECAP_RATE_LIMIT_MAX_FAILURES } = require("../middleware/rateLimits")

const SECRET = "test-recap-secret"
const TOURNAMENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"
const CLOSED_AT = new Date("2026-10-20T23:40:00.000Z")

const finishedTournament = (overrides = {}) => ({
    _id: TOURNAMENT_ID,
    name: "Copa Argentina 2026",
    format: "playoff",
    playoffMode: "single",
    ongoing: false,
    closedAt: CLOSED_AT,
    outcome: {
        champion: {
            player: { id: "u-nico", name: "Nico" },
            team: { id: 9, name: "Liverpool" },
        },
        finalist: {
            player: { id: "u-max", name: "Max" },
            team: { id: 6, name: "Chelsea" },
        },
    },
    ...overrides,
})

const validRecap = [
    "## El campeón",
    "Nico llevó a Liverpool al título.",
    "## Playoffs",
    "En la final venció a Max y su Chelsea.",
    "## Salón de la fama",
    "Su primer título.",
].join("\n")

const validBody = (overrides = {}) => ({
    tournamentId: TOURNAMENT_ID,
    headline: "Nico campeón con Liverpool",
    summary: "Una final para el recuerdo.",
    recap: validRecap,
    generation: {
        model: "claude-sonnet-5-5",
        promptVersion: "tournament-recap-v1",
        contextVersion: "tournament-recap-5",
        ratingVersion: "2.0",
        drawModelVersion: "draw-1",
        contextHash: "abc123",
    },
    // `$now.toISO()` de n8n: ISO con huso horario.
    createdAt: "2026-10-21T09:00:00.000-03:00",
    ...overrides,
})

const withApp = async (t, callback, options = {}) => {
    const previousSecret = process.env.RECAP_SECRET
    process.env.RECAP_SECRET = SECRET
    t.after(() => {
        if (previousSecret === undefined) delete process.env.RECAP_SECRET
        else process.env.RECAP_SECRET = previousSecret
    })

    const state = {
        upserts: [],
        reads: [],
        tournament: finishedTournament(),
        hasMatches: true,
        users: [],
        updatedExisting: false,
        failures: [],
        ...options,
    }

    t.mock.method(
        tournamentRecapsModel,
        "findOneAndUpdate",
        async (...args) => {
            state.upserts.push(args)
            const failure = state.failures.shift()
            if (failure) throw failure

            return {
                value: {
                    ...args[1].$set,
                    revision: state.updatedExisting ? 2 : 1,
                },
                lastErrorObject: { updatedExisting: state.updatedExisting },
            }
        }
    )
    t.mock.method(tournamentsModel, "findById", async (id) => {
        state.reads.push(["tournament", id])
        return state.tournament
    })
    t.mock.method(matchesModel, "exists", async (filter) => {
        state.reads.push(["matches", filter])
        return state.hasMatches ? { _id: "m1" } : null
    })
    t.mock.method(usersModel, "find", async () => {
        state.reads.push(["users"])
        return state.users
    })

    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected", name: "apa_test" }),
    })
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`
        await callback({ baseUrl, state })
    } finally {
        server.close()
        await once(server, "close")
    }
}

const post = (baseUrl, body, headers = {}) =>
    globalThis.fetch(`${baseUrl}/api/tournament-recaps`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    })

const authorized = { [RECAP_SECRET_HEADER]: SECRET }

test("tournament recap routes reject a missing or wrong secret without touching Mongo", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const requests = [
            () => post(baseUrl, validBody()),
            () =>
                post(baseUrl, validBody(), {
                    [RECAP_SECRET_HEADER]: "nope",
                }),
            () => globalThis.fetch(`${baseUrl}/api/tournament-recaps/pending`),
            () =>
                globalThis.fetch(
                    `${baseUrl}/api/tournament-recaps/context?tournamentId=${TOURNAMENT_ID}`,
                    { headers: { [RECAP_SECRET_HEADER]: "nope" } }
                ),
        ]

        for (const send of requests) {
            const response = await send()

            assert.equal(response.status, 401)
            assert.equal(
                (await response.json()).error.code,
                "INVALID_RECAP_SECRET"
            )
        }

        assert.equal(state.upserts.length, 0)
        assert.equal(state.reads.length, 0)
    })
})

test("tournament recap routes are closed when the secret is not configured", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        delete process.env.RECAP_SECRET

        const responses = [
            await post(baseUrl, validBody(), { [RECAP_SECRET_HEADER]: "" }),
            await globalThis.fetch(`${baseUrl}/api/tournament-recaps/pending`),
            await globalThis.fetch(
                `${baseUrl}/api/tournament-recaps/context?tournamentId=${TOURNAMENT_ID}`
            ),
        ]

        for (const response of responses) {
            assert.equal(response.status, 503)
            assert.equal(
                (await response.json()).error.code,
                "RECAP_SECRET_NOT_CONFIGURED"
            )
        }

        assert.equal(state.upserts.length, 0)
        assert.equal(state.reads.length, 0)
    })
})

test("POST /api/tournament-recaps validates the body (unknown fields, ids and limits)", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const withChange = (change) => ({ ...validBody(), ...change })
        const withGeneration = (change) =>
            withChange({ generation: { ...validBody().generation, ...change } })
        const without = (field) => {
            const body = validBody()
            delete body[field]
            return body
        }
        const withoutGeneration = (field) => {
            const generation = { ...validBody().generation }
            delete generation[field]
            return withChange({ generation })
        }

        const invalidBodies = [
            withChange({ revision: 5 }),
            withChange({ image: { url: "http://x" } }),
            withChange({ tournament: "Otro nombre" }),
            withChange({ format: "league" }),
            withChange({ closedAt: "2026-10-20T00:00:00.000Z" }),
            withChange({ unexpected: true }),
            withChange({ tournamentId: "no-es-un-objectid" }),
            without("tournamentId"),
            without("headline"),
            without("summary"),
            without("recap"),
            without("generation"),
            without("createdAt"),
            withChange({ headline: "x".repeat(141) }),
            withChange({ summary: "x".repeat(501) }),
            withChange({ recap: "x".repeat(50001) }),
            withChange({ headline: "   " }),
            withChange({ language: "español" }),
            withChange({ createdAt: "ayer" }),
            withGeneration({ extra: "x" }),
            withGeneration({ model: "" }),
            withGeneration({ contextHash: "x".repeat(101) }),
            withoutGeneration("promptVersion"),
            withoutGeneration("drawModelVersion"),
        ]

        for (const body of invalidBodies) {
            const response = await post(baseUrl, body, authorized)

            assert.equal(
                response.status,
                400,
                `expected 400 for ${JSON.stringify(body).slice(0, 90)}`
            )
            assert.equal((await response.json()).error.code, "VALIDATION_ERROR")
        }

        const labelled = await post(
            baseUrl,
            withGeneration({ model: "" }),
            authorized
        )

        assert.match(
            (await labelled.json()).error.message,
            /El modelo no puede estar vacío/
        )
        assert.equal(state.upserts.length, 0)
        assert.equal(state.reads.length, 0)
    })
})

test("POST /api/tournament-recaps answers 404, 409 and 422 for business errors", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        state.tournament = null
        const missing = await post(baseUrl, validBody(), authorized)
        assert.equal(missing.status, 404)
        assert.equal((await missing.json()).error.code, "TOURNAMENT_NOT_FOUND")

        state.tournament = finishedTournament({ ongoing: true })
        const ongoing = await post(baseUrl, validBody(), authorized)
        assert.equal(ongoing.status, 409)
        assert.equal(
            (await ongoing.json()).error.code,
            "TOURNAMENT_NOT_FINISHED"
        )

        state.tournament = finishedTournament({ outcome: undefined })
        const withoutChampion = await post(baseUrl, validBody(), authorized)
        assert.equal(withoutChampion.status, 409)

        state.tournament = finishedTournament({ legacy: true })
        state.hasMatches = false
        const withoutMatches = await post(baseUrl, validBody(), authorized)
        assert.equal(withoutMatches.status, 422)
        assert.equal(
            (await withoutMatches.json()).error.code,
            "TOURNAMENT_WITHOUT_MATCHES"
        )

        assert.equal(state.upserts.length, 0)
    })
})

test("POST /api/tournament-recaps checks matches with a played, valid filter", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        await post(baseUrl, validBody(), authorized)

        const [, filter] = state.reads.find(([kind]) => kind === "matches")

        assert.deepEqual(filter, {
            "tournament.id": TOURNAMENT_ID,
            played: true,
            valid: { $ne: false },
        })
    })
})

test("POST /api/tournament-recaps rejects a recap without the required sections or names", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const response = await post(
            baseUrl,
            validBody({
                recap: "## El campeón\nGanó Nico con Liverpool.\n## Playoffs\nTexto.",
            }),
            authorized
        )
        const body = await response.json()

        assert.equal(response.status, 422)
        assert.equal(body.error.code, "TOURNAMENT_RECAP_CONTENT_INVALID")

        const messages = body.error.details.map(({ message }) => message)

        assert.ok(
            messages.includes(
                'Falta la sección "## Salón de la fama / En la historia"'
            )
        )
        assert.ok(messages.some((message) => message.includes("Max")))
        assert.ok(messages.some((message) => message.includes("Chelsea")))
        assert.equal(
            messages.some((message) => message.includes("Liverpool")),
            false
        )
        assert.equal(state.upserts.length, 0)
    })
})

test("POST /api/tournament-recaps accepts the nickname of a player as well as the stored name", async (t) => {
    await withApp(
        t,
        async ({ baseUrl, state }) => {
            const response = await post(
                baseUrl,
                validBody({
                    recap: validRecap.replace("Nico", "Nicolás"),
                }),
                authorized
            )

            assert.equal(response.status, 201)
            assert.equal(state.upserts.length, 1)
        },
        { users: [{ id: "u-nico", nickname: "Nicolás" }] }
    )
})

test("POST /api/tournament-recaps upserts by tournament: 201 on create, 200 on replace", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const created = await post(baseUrl, validBody(), authorized)
        const createdBody = await created.json()

        assert.equal(created.status, 201)
        assert.equal(createdBody.success, true)
        assert.equal(createdBody.replaced, false)
        assert.equal(createdBody.data.revision, 1)

        const [filter, update, options] = state.upserts[0]

        assert.deepEqual(filter, { tournamentId: TOURNAMENT_ID })
        assert.deepEqual(update.$inc, { revision: 1 })
        assert.equal("revision" in update.$set, false)
        assert.equal(options.upsert, true)
        assert.equal(options.runValidators, true)
        assert.equal(
            update.$set.createdAt.toISOString(),
            "2026-10-21T12:00:00.000Z"
        )
        assert.equal(update.$set.language, "es-AR")

        state.updatedExisting = true
        const replaced = await post(baseUrl, validBody(), authorized)
        const replacedBody = await replaced.json()

        assert.equal(replaced.status, 200)
        assert.equal(replacedBody.replaced, true)
        assert.equal(replacedBody.data.revision, 2)
    })
})

test("POST /api/tournament-recaps stores tournament, format and closedAt from the tournament document", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        await post(baseUrl, validBody(), authorized)

        const { $set } = state.upserts[0][1]

        assert.equal($set.tournamentId, TOURNAMENT_ID)
        assert.equal($set.tournament, "Copa Argentina 2026")
        assert.equal($set.format, "playoff")
        assert.equal($set.closedAt.toISOString(), CLOSED_AT.toISOString())
        assert.deepEqual($set.generation, validBody().generation)
    })
})

test("POST /api/tournament-recaps retries once on a duplicate key race", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        state.failures = [Object.assign(new Error("E11000"), { code: 11000 })]
        const response = await post(baseUrl, validBody(), authorized)

        assert.equal(response.status, 201)
        assert.equal(state.upserts.length, 2)
    })
})

test("POST /api/tournament-recaps does not retry a second duplicate key error", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        state.failures = [
            Object.assign(new Error("E11000"), { code: 11000 }),
            Object.assign(new Error("E11000"), { code: 11000 }),
        ]
        const response = await post(baseUrl, validBody(), authorized)

        assert.equal(response.status, 500)
        assert.equal(state.upserts.length, 2)

        state.failures = [new Error("otra falla")]
        state.upserts.length = 0
        const other = await post(baseUrl, validBody(), authorized)

        assert.equal(other.status, 500)
        assert.equal(state.upserts.length, 1)
    })
})

const stubFindOne = (t, document) => {
    const seen = {}
    t.mock.method(tournamentRecapsModel, "findOne", (filter) => {
        seen.filter = filter
        const query = {
            select(fields) {
                seen.select = fields
                return query
            },
            lean: async () => document,
        }
        return query
    })
    return seen
}

test("GET /api/tournaments/:tournament/recap is public and hides _id and __v", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        const seen = stubFindOne(t, {
            tournamentId: TOURNAMENT_ID,
            headline: "Titular",
            recap: "## El campeón",
        })

        // Sin el header del secreto.
        const response = await globalThis.fetch(
            `${baseUrl}/api/tournaments/${TOURNAMENT_ID}/recap`
        )

        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), {
            success: true,
            data: {
                tournamentId: TOURNAMENT_ID,
                headline: "Titular",
                recap: "## El campeón",
            },
        })
        assert.deepEqual(seen.filter, { tournamentId: TOURNAMENT_ID })
        assert.equal(seen.select, "-_id -__v")
    })
})

test("GET /api/tournaments/:tournament/recap answers 404 and 400", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        stubFindOne(t, null)

        const missing = await globalThis.fetch(
            `${baseUrl}/api/tournaments/${TOURNAMENT_ID}/recap`
        )

        assert.equal(missing.status, 404)
        assert.equal(
            (await missing.json()).error.code,
            "TOURNAMENT_RECAP_NOT_FOUND"
        )

        const invalid = await globalThis.fetch(
            `${baseUrl}/api/tournaments/no-es-un-id/recap`
        )

        assert.equal(invalid.status, 400)

        const withQuery = await globalThis.fetch(
            `${baseUrl}/api/tournaments/${TOURNAMENT_ID}/recap?page=1`
        )

        assert.equal(withQuery.status, 400)
    })
})

test("the pending and context routes validate their query before reading", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const urls = [
            "/api/tournament-recaps/pending?limit=21",
            "/api/tournament-recaps/pending?closedAfter=ayer",
            "/api/tournament-recaps/pending?includeBackfill=true",
            "/api/tournament-recaps/context",
            "/api/tournament-recaps/context?tournamentId=abc",
            `/api/tournament-recaps/context?tournamentId=${TOURNAMENT_ID}&detail=huge`,
        ]

        for (const url of urls) {
            const response = await globalThis.fetch(`${baseUrl}${url}`, {
                headers: authorized,
            })

            assert.equal(response.status, 400, url)
        }

        assert.equal(state.reads.length, 0)
    })
})

test("tournament recap routes block an IP after repeated invalid secrets", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        let last
        // Los 401 de los tests anteriores ya cuentan para esta IP.
        for (
            let attempt = 0;
            attempt < RECAP_RATE_LIMIT_MAX_FAILURES;
            attempt++
        ) {
            last = await globalThis.fetch(
                `${baseUrl}/api/tournament-recaps/pending`,
                { headers: { [RECAP_SECRET_HEADER]: "nope" } }
            )
        }

        assert.equal(last.status, 429)
        assert.equal((await last.json()).error.code, "TOO_MANY_RECAP_ATTEMPTS")

        // También bloquea el POST: comparten limitador.
        const blockedPost = await post(baseUrl, validBody(), authorized)

        assert.equal(blockedPost.status, 429)
    })
})
