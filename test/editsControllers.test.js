const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetEdits } = require("../controller/getEdits")
const { createDeleteEdit } = require("../controller/deleteEdit")

const createResponse = () => ({
    body: null,
    json(body) {
        this.body = body
        return this
    },
})

test("get edits uses validated pagination and stable response metadata", async () => {
    let pagination
    const controller = createGetEdits({
        countEdits: async () => 10,
        findEdits: async (options) => {
            pagination = options
            return [{ _id: "edit" }]
        },
    })
    const response = createResponse()

    await controller({ query: { page: 2 } }, response)

    assert.deepEqual(pagination, { skip: 9, limit: 9 })
    assert.deepEqual(response.body.pagination, {
        currentPage: 2,
        totalPages: 2,
        totalEdits: 10,
        editsPerPage: 9,
        hasNextPage: false,
        hasPrevPage: true,
    })
})

test("get edits propagates persistence failures to the central handler", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetEdits({
        countEdits: async () => {
            throw expectedError
        },
        findEdits: async () => [],
    })

    await assert.rejects(
        controller({ query: { page: 1 } }, createResponse()),
        expectedError
    )
})

test("delete edit removes Mongo reference even if Cloudinary fails", async () => {
    const logs = []
    let deletedId
    const controller = createDeleteEdit({
        destroyAsset: async () => {
            throw new Error("Provider details must not be logged")
        },
        deleteEditById: async (id) => {
            deletedId = id
        },
        logger: { error: (event, fields) => logs.push({ event, fields }) },
    })
    const response = createResponse()

    await controller(
        {
            params: { id: "edit-id" },
            edit: { public_id: "edits/private-id" },
            requestId: "request-id",
        },
        response
    )

    assert.equal(deletedId, "edit-id")
    assert.deepEqual(logs, [
        {
            event: "cloudinary_delete_failed",
            fields: { requestId: "request-id" },
        },
    ])
    assert.equal(JSON.stringify(logs).includes("private-id"), false)
    assert.equal(response.body.deletedId, "edit-id")
})

test("delete edit propagates Mongo failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createDeleteEdit({
        destroyAsset: async () => {},
        deleteEditById: async () => {
            throw expectedError
        },
        logger: { error: () => {} },
    })

    await assert.rejects(
        controller(
            {
                params: { id: "edit-id" },
                edit: { public_id: "edits/id" },
            },
            createResponse()
        ),
        expectedError
    )
})
