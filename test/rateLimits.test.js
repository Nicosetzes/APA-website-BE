const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")
const express = require("express")

const { errorHandler } = require("../middleware/httpErrors")
const {
    EDIT_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    editUploadRateLimit,
} = require("../middleware/rateLimits")
const { root } = require("../router/router")

const withServer = async (app, callback) => {
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const address = server.address()
        await callback(`http://127.0.0.1:${address.port}`)
    } finally {
        server.close()
        await once(server, "close")
    }
}

test("edit upload limiter is wired after authentication and before Multer", () => {
    const route = root.stack.find(
        (layer) => layer.route?.path === "/edits" && layer.route.methods.post
    )
    const handlers = route.route.stack.map((layer) => layer.handle)

    assert.equal(handlers[0].name, "isAuth")
    assert.equal(handlers[1], editUploadRateLimit)
    assert.equal(handlers[2].name, "multerMiddleware")
})

test("edit upload limits are isolated by authenticated user", async () => {
    const app = express()
    app.set("trust proxy", 1)
    app.use((req, res, next) => {
        req.user = { id: req.headers["x-test-user"] }
        next()
    })
    app.post("/upload", editUploadRateLimit, (req, res) => {
        res.status(204).end()
    })
    app.use(errorHandler)

    await withServer(app, async (baseUrl) => {
        let blockedResponse

        for (
            let requestNumber = 0;
            requestNumber <= EDIT_UPLOAD_RATE_LIMIT_MAX_REQUESTS;
            requestNumber += 1
        ) {
            blockedResponse = await globalThis.fetch(`${baseUrl}/upload`, {
                method: "POST",
                headers: { "x-test-user": "user-1" },
            })
        }

        const blockedBody = await blockedResponse.json()
        assert.equal(blockedResponse.status, 429)
        assert.equal(blockedBody.error.code, "TOO_MANY_EDIT_UPLOADS")
        assert.ok(blockedResponse.headers.get("ratelimit"))
        assert.ok(blockedResponse.headers.get("retry-after"))

        const otherUserResponse = await globalThis.fetch(`${baseUrl}/upload`, {
            method: "POST",
            headers: { "x-test-user": "user-2" },
        })
        assert.equal(otherUserResponse.status, 204)
    })
})
