const assert = require("node:assert/strict")
const test = require("node:test")

const usersModel = require("../dao/models/users")
const findUserByUserName = require("../dao/findUserByUserName")

const validHash = `$2b$10$${"a".repeat(53)}`

test("users normalize email and nickname on new writes", async () => {
    const user = new usersModel({
        email: "  USER@Example.COM ",
        password: validHash,
        nickname: "  Nico  ",
    })

    await user.validate()

    assert.equal(user.email, "user@example.com")
    assert.equal(user.nickname, "Nico")
    assert.equal(user.role, "user")
})

test("users reject invalid emails, password hashes and roles", async () => {
    const user = new usersModel({
        email: "invalid-email",
        password: "plain-text-password",
        nickname: "Nico",
        role: "admin",
    })

    const error = user.validateSync()

    assert.ok(error.errors.email)
    assert.ok(error.errors.password)
    assert.ok(error.errors.role)
})

test("password hashes are excluded from queries by default", () => {
    assert.equal(usersModel.schema.path("password").options.select, false)
})

test("login lookup explicitly selects the password hash", async (t) => {
    const originalFindOne = usersModel.findOne
    let selectedFields

    t.after(() => {
        usersModel.findOne = originalFindOne
    })

    usersModel.findOne = (filter) => ({
        select: async (fields) => {
            selectedFields = fields
            return { email: filter.email, password: validHash }
        },
    })

    const user = await findUserByUserName("user@example.com")

    assert.equal(selectedFields, "+password")
    assert.equal(user.password, validHash)
})
