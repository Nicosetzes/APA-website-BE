const usersModel = require("./../models/users.js")

const findUserById = async (id) => {
    const foundUser = await usersModel.findById(id)
    return foundUser
}

module.exports = findUserById
