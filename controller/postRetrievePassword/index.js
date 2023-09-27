/* Hago toda la lógica acá en el controlador, esto es temporal */

const usersModel = require("./../../dao/models/users")
const tokensModel = require("../../dao/models/tokens")

const bcrypt = require("bcrypt")

const postRetrievePassword = async (req, res) => {
    // BODY
    //     {
    //     "token":"4f546b55258a10288c7e28650fbebcc51d1252b2a69823f8cd1c65144c69664e",
    //     "userId":"600205cc5fdfce952e9813d8",
    //     "password":"kjgjgkflgk.hlkhol"
    // }

    try {
        const { userId, token, password } = req.body

        let passwordResetToken = await tokensModel.findOne({ userId })

        if (!passwordResetToken) {
            throw new Error("Invalid or expired password reset token")
        }

        const isValid = await bcrypt.compare(token, passwordResetToken.token)

        if (!isValid) {
            throw new Error("Invalid or expired password reset token")
        }

        const hash = await bcrypt.hash(password, 10)

        await usersModel.updateOne(
            { _id: userId },
            { $set: { password: hash } },
            { new: true }
        )

        await passwordResetToken.deleteOne()
        return res
            .status(200)
            .json({ message: `Contraseña restablecida con éxito` })
    } catch (err) {
        return res.status(500).send({
            err,
            message: `Hubo un problema con el registro, intente más tarde`,
        })
    }
}

module.exports = postRetrievePassword
