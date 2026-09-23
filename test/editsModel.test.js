const assert = require("node:assert/strict")
const test = require("node:test")
const mongoose = require("mongoose")

const editsModel = require("../dao/models/edits")

test("edits normalize required Cloudinary strings", async () => {
    const edit = new editsModel({
        user: new mongoose.Types.ObjectId(),
        url: "  https://example.test/edit.png  ",
        public_id: "  edits/example  ",
    })

    await edit.validate()

    assert.equal(edit.url, "https://example.test/edit.png")
    assert.equal(edit.public_id, "edits/example")
})

test("edits reject missing owners and blank Cloudinary fields", () => {
    const edit = new editsModel({
        url: "   ",
        public_id: "   ",
    })

    const error = edit.validateSync()

    assert.ok(error.errors.user)
    assert.ok(error.errors.url)
    assert.ok(error.errors.public_id)
})

test("timestamps are managed only by the schema timestamps option", () => {
    assert.equal(editsModel.schema.options.timestamps, true)
    assert.ok(editsModel.schema.path("createdAt"))
    assert.ok(editsModel.schema.path("updatedAt"))
    assert.equal(editsModel.schema.path("createdAt").defaultValue, undefined)
})
