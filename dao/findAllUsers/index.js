const usersModel = require("./../models/users.js")

const findAllUsers = async () => {
    const foundUsers = await usersModel.find({})
    return foundUsers
}

module.exports = findAllUsers
