const assert = require("node:assert/strict")
const test = require("node:test")

const { createPostEdits } = require("../controller/postEdits")

const uploadedFiles = [
    { path: "https://example.test/one.png", filename: "edits/one" },
    { path: "https://example.test/two.png", filename: "edits/two" },
]

const createRequest = () => ({
    files: uploadedFiles,
    user: { id: "user-id" },
    requestId: "request-id",
})

const createResponse = () => ({
    body: null,
    json(body) {
        this.body = body
        return this
    },
})

const runTransaction = (work) => work({ id: "session" })

test("successful edit persistence uses one transaction and does not compensate", async () => {
    let receivedDocuments
    let receivedSession
    let destroyCalls = 0
    const persisted = [{ _id: "one" }, { _id: "two" }]
    const controller = createPostEdits({
        persistEdits: async (documents, options) => {
            receivedDocuments = documents
            receivedSession = options.session
            return persisted
        },
        destroyAsset: async () => {
            destroyCalls += 1
        },
        withTransaction: runTransaction,
        logger: { error: () => {} },
    })
    const response = createResponse()

    await controller(createRequest(), response)

    assert.equal(receivedSession.id, "session")
    assert.deepEqual(receivedDocuments, [
        {
            user: "user-id",
            url: uploadedFiles[0].path,
            public_id: uploadedFiles[0].filename,
        },
        {
            user: "user-id",
            url: uploadedFiles[1].path,
            public_id: uploadedFiles[1].filename,
        },
    ])
    assert.equal(destroyCalls, 0)
    assert.equal(response.body.count, 2)
    assert.equal(response.body.data, persisted)
})

test("Mongo failure compensates every uploaded Cloudinary asset", async () => {
    const destroyed = []
    const logs = []
    const controller = createPostEdits({
        persistEdits: async () => {
            throw new Error("Mongo failed")
        },
        destroyAsset: async (publicId) => destroyed.push(publicId),
        withTransaction: runTransaction,
        logger: { error: (event, fields) => logs.push({ event, fields }) },
    })

    const error = await controller(createRequest(), createResponse()).catch(
        (caughtError) => caughtError
    )

    assert.equal(error.code, "EDIT_PERSISTENCE_ERROR")
    assert.deepEqual(destroyed, ["edits/one", "edits/two"])
    assert.deepEqual(logs, [
        {
            event: "edit_upload_compensation",
            fields: { requestId: "request-id", attempted: 2, failed: 0 },
        },
    ])
})

test("partial Cloudinary compensation is reported without exposing asset IDs", async () => {
    const logs = []
    const controller = createPostEdits({
        persistEdits: async () => {
            throw new Error("Mongo failed")
        },
        destroyAsset: async (publicId) => {
            if (publicId === "edits/two") throw new Error("Cloudinary failed")
        },
        withTransaction: runTransaction,
        logger: { error: (event, fields) => logs.push({ event, fields }) },
    })

    const error = await controller(createRequest(), createResponse()).catch(
        (caughtError) => caughtError
    )

    assert.equal(error.code, "EDIT_UPLOAD_COMPENSATION_INCOMPLETE")
    assert.deepEqual(logs[0].fields, {
        requestId: "request-id",
        attempted: 2,
        failed: 1,
    })
    assert.equal(JSON.stringify(logs).includes("edits/two"), false)
})

test("a request without uploaded files fails before opening a transaction", async () => {
    let transactionCalls = 0
    const controller = createPostEdits({
        persistEdits: async () => [],
        destroyAsset: async () => {},
        withTransaction: async () => {
            transactionCalls += 1
        },
        logger: { error: () => {} },
    })

    const error = await controller(
        { files: [], user: { id: "user-id" } },
        createResponse()
    ).catch((caughtError) => caughtError)

    assert.equal(error.code, "NO_FILES_UPLOADED")
    assert.equal(error.status, 400)
    assert.equal(transactionCalls, 0)
})
