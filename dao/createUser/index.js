const usersModel = require("./../models/users.js")

const createUser = async (user) => {
    const newUser = await usersModel.create(user)
    return newUser
}

module.exports = createUser
