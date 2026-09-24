const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")

const { retrieveUserByUserName } = require("./../../service")
const { HttpError } = require("../../middleware/httpErrors")

// Hash descartable de una cadena aleatoria. Se compara contra él cuando el
// usuario no existe, para que la respuesta tarde lo mismo que con un usuario
// real y no se pueda enumerar cuentas por tiempo.
const DUMMY_PASSWORD_HASH =
    "$2b$10$RhvZqqG2.zO0JZJKYwloQePtjfL4.ioKtQSDQM4COEHL9vc40Y9Cq"

const invalidCredentials = () =>
    new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "El email o la contraseña no son correctos"
    )

const createPostLogin = (dependencies = {}) => {
    const retrieveUser =
        dependencies.retrieveUserByUserName || retrieveUserByUserName
    const comparePassword = dependencies.comparePassword || bcrypt.compare
    const signToken = dependencies.signToken || jwt.sign

    return async (req, res) => {
        const { email, password } = req.body
        const user = await retrieveUser(email)

        // Misma respuesta para usuario inexistente y contraseña incorrecta.
        const isPasswordValid = await comparePassword(
            password,
            user?.password || DUMMY_PASSWORD_HASH
        )

        if (!user || !isPasswordValid) {
            throw invalidCredentials()
        }

        const token = signToken(
            {
                id: user._id,
                name: user.nickname,
            },
            process.env.TOKEN_SECRET,
            {
                algorithm: "HS256",
                expiresIn: "24h",
            }
        )

        return res.status(200).send({
            auth: true,
            token,
            user: {
                id: user._id,
                nickname: user.nickname,
                role: user.role || "user",
            },
            message: `Bienvenid@ ${user.nickname}`,
        })
    }
}

const postLogin = createPostLogin()

module.exports = postLogin
module.exports.createPostLogin = createPostLogin
