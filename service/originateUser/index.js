const { createUser } = require("./../../dao")

const originateUser = async (user) => {
    return await createUser(user)
}

module.exports = originateUser
