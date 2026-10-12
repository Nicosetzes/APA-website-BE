process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const recapsModel = require("../dao/models/recaps")
const { RECAP_SECRET_HEADER } = require("../middleware/requireRecapSecret")
const { RECAP_RATE_LIMIT_MAX_FAILURES } = require("../middleware/rateLimits")

const SECRET = "test-recap-secret"

const validBody = () => ({
    date: "2026-10-11",
    matchCount: 3,
    recap: "Liga APA\nNico 2-1 Santi",
    tournaments: [
        {
            tournamentId: "aaaaaaaaaaaaaaaaaaaaaaaa",
            tournament: "Liga APA",
            matchCount: 3,
            matchesByStage: { playoff: 2, playin: 0, regular: 0 },
        },
    ],
    createdAt: "2026-10-12T09:00:00.000Z",
})

const withApp = async (t, callback) => {
    const previousSecret = process.env.RECAP_SECRET
    process.env.RECAP_SECRET = SECRET
    t.after(() => {
        if (previousSecret === undefined) delete process.env.RECAP_SECRET
        else process.env.RECAP_SECRET = previousSecret
    })

    const calls = []
    t.mock.method(recapsModel, "findOneAndUpdate", async (...args) => {
        calls.push(args)
        return {
            value: { ...args[1].$set },
            lastErrorObject: { updatedExisting: calls.updatedExisting },
        }
    })

    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected", name: "apa_test" }),
    })
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`
        await callback({ baseUrl, calls })
    } finally {
        server.close()
        await once(server, "close")
    }
}

const postRecap = (baseUrl, body, headers = {}) =>
    globalThis.fetch(`${baseUrl}/api/recaps`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    })

test("POST /api/recaps rejects a missing or wrong secret without touching Mongo", async (t) => {
    await withApp(t, async ({ baseUrl, calls }) => {
        const missing = await postRecap(baseUrl, validBody())
        assert.equal(missing.status, 401)
        assert.equal((await missing.json()).error.code, "INVALID_RECAP_SECRET")

        const wrong = await postRecap(baseUrl, validBody(), {
            [RECAP_SECRET_HEADER]: "nope",
        })
        assert.equal(wrong.status, 401)

        assert.equal(calls.length, 0)
    })
})

test("POST /api/recaps is closed when the secret is not configured", async (t) => {
    await withApp(t, async ({ baseUrl, calls }) => {
        delete process.env.RECAP_SECRET

        const response = await postRecap(baseUrl, validBody(), {
            [RECAP_SECRET_HEADER]: "",
        })

        assert.equal(response.status, 503)
        assert.equal(
            (await response.json()).error.code,
            "RECAP_SECRET_NOT_CONFIGURED"
        )
        assert.equal(calls.length, 0)
    })
})

test("POST /api/recaps upserts by date and answers 201 on create, 200 on replace", async (t) => {
    await withApp(t, async ({ baseUrl, calls }) => {
        const headers = { [RECAP_SECRET_HEADER]: SECRET }

        const created = await postRecap(baseUrl, validBody(), headers)
        const createdBody = await created.json()
        assert.equal(created.status, 201)
        assert.equal(createdBody.replaced, false)
        assert.equal(createdBody.data.date, "2026-10-11")

        const [filter, update] = calls[0]
        assert.deepEqual(filter, { date: "2026-10-11" })
        assert.equal(update.$set.recap, "Liga APA\nNico 2-1 Santi")
        assert.equal(
            update.$set.createdAt.toISOString(),
            "2026-10-12T09:00:00.000Z"
        )
        assert.deepEqual(update.$set.tournaments[0].matchesByStage, {
            playoff: 2,
            playin: 0,
            regular: 0,
        })

        calls.updatedExisting = true
        const replaced = await postRecap(baseUrl, validBody(), headers)
        assert.equal(replaced.status, 200)
        assert.equal((await replaced.json()).replaced, true)
    })
})

test("POST /api/recaps validates the body", async (t) => {
    await withApp(t, async ({ baseUrl, calls }) => {
        const headers = { [RECAP_SECRET_HEADER]: SECRET }
        const withChange = (change) => ({ ...validBody(), ...change })
        const withTournament = (change) =>
            withChange({
                tournaments: [{ ...validBody().tournaments[0], ...change }],
            })
        const withoutRecap = validBody()
        delete withoutRecap.recap

        const invalidBodies = [
            withoutRecap,
            withChange({ recap: "   " }),
            withChange({ date: "11-10-2026" }),
            withChange({ date: "10-11-2026" }),
            withChange({ date: "2026-02-30" }),
            withChange({ matchCount: -1 }),
            withChange({ createdAt: "ayer" }),
            withChange({ tournaments: "Liga APA" }),
            withChange({ tournaments: [{ tournamentId: "x" }] }),
            withTournament({ matchesByStage: { "Fecha 4": [] } }),
            withTournament({ matchesByStage: { playoff: 2, playin: 0 } }),
            withTournament({
                matchesByStage: { playoff: -1, playin: 0, regular: 0 },
            }),
            withTournament({
                matchesByStage: { playoff: "dos", playin: 0, regular: 0 },
            }),
            withTournament({
                matchesByStage: { playoff: 2, playin: 0, regular: 0, extra: 1 },
            }),
            withChange({ unexpected: true }),
        ]

        for (const body of invalidBodies) {
            const response = await postRecap(baseUrl, body, headers)
            assert.equal(
                response.status,
                400,
                `expected 400 for ${JSON.stringify(body).slice(0, 80)}`
            )
            assert.equal((await response.json()).error.code, "VALIDATION_ERROR")
        }

        assert.equal(calls.length, 0)
    })
})

test("POST /api/recaps blocks an IP after repeated invalid secrets", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        let last
        // Los dos 401 de los tests anteriores ya cuentan para esta IP.
        for (
            let attempt = 0;
            attempt < RECAP_RATE_LIMIT_MAX_FAILURES;
            attempt++
        ) {
            last = await postRecap(baseUrl, validBody(), {
                [RECAP_SECRET_HEADER]: "nope",
            })
        }

        assert.equal(last.status, 429)
        assert.equal((await last.json()).error.code, "TOO_MANY_RECAP_ATTEMPTS")
    })
})

const stubFindOne = (t, document) => {
    const seen = {}
    t.mock.method(recapsModel, "findOne", (filter) => {
        seen.filter = filter
        const query = {
            sort(sort) {
                seen.sort = sort
                return query
            },
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

test("GET /api/recaps/:date is public and returns that day's recap", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        const seen = stubFindOne(t, { date: "2026-10-11", recap: "texto" })

        const response = await globalThis.fetch(
            `${baseUrl}/api/recaps/2026-10-11`
        )

        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), {
            success: true,
            data: { date: "2026-10-11", recap: "texto" },
        })
        assert.deepEqual(seen.filter, { date: "2026-10-11" })
        assert.equal(seen.select, "-_id -__v")
    })
})

test("GET /api/recaps/latest returns the most recent day", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        const seen = stubFindOne(t, { date: "2026-10-12" })

        const response = await globalThis.fetch(`${baseUrl}/api/recaps/latest`)

        assert.equal(response.status, 200)
        assert.deepEqual(seen.sort, { date: -1 })
    })
})

test("GET /api/recaps rejects bad dates and answers 404 when there is no recap", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        stubFindOne(t, null)

        for (const date of ["11-10-2026", "10-11-2026", "2026-02-30"]) {
            const response = await globalThis.fetch(
                `${baseUrl}/api/recaps/${date}`
            )
            assert.equal(response.status, 400, date)
        }

        const missing = await globalThis.fetch(
            `${baseUrl}/api/recaps/2026-10-11`
        )
        assert.equal(missing.status, 404)
        assert.equal((await missing.json()).error.code, "RECAP_NOT_FOUND")

        const none = await globalThis.fetch(`${baseUrl}/api/recaps/latest`)
        assert.equal(none.status, 404)
    })
})

test("GET /api/recaps/dates lists only the dates, newest first, and is not shadowed by :date", async (t) => {
    await withApp(t, async ({ baseUrl }) => {
        const seen = {}
        t.mock.method(recapsModel, "find", () => {
            const query = {
                sort(sort) {
                    seen.sort = sort
                    return query
                },
                select(fields) {
                    seen.select = fields
                    return query
                },
                lean: async () => [
                    { date: "2026-10-12" },
                    { date: "2026-10-11" },
                ],
            }
            return query
        })

        const response = await globalThis.fetch(`${baseUrl}/api/recaps/dates`)

        assert.equal(response.status, 200)
        assert.deepEqual(await response.json(), {
            success: true,
            data: ["2026-10-12", "2026-10-11"],
        })
        assert.deepEqual(seen, { sort: { date: -1 }, select: "date -_id" })

        const withQuery = await globalThis.fetch(
            `${baseUrl}/api/recaps/dates?page=1`
        )
        assert.equal(withQuery.status, 400)
    })
})
