/* Hago toda la lógica acá en el controlador, esto es temporal */

const tokensModel = require("./../../dao/models/tokens")

const { retrieveUserByUserName } = require("../../service")

const bcrypt = require("bcrypt")
const crypto = require("crypto")

const postSolicitateNewPassword = async (req, res) => {
    try {
        let { email } = req.body

        const user = await retrieveUserByUserName(email)

        if (!user)
            return res.status(400).json({
                message: `¡No existe un usuario con ese email!`,
            })

        const token = await tokensModel.findOne({ userId: user._id })

        if (token) {
            await token.deleteOne()
        }

        const resetToken = crypto.randomBytes(32).toString("hex")

        const hash = await bcrypt.hash(resetToken, 10)

        await new tokensModel({
            userId: user._id,
            token: hash,
            createdAt: Date.now(),
        }).save()

        // const client_URL =
        //     process.env.NODE_ENV == "development"
        //         ? `localhost://3000`
        //         : `sitioapa.com.ar` /* Chequear */

        // const link = `${client_URL}/users/retrieve-password?token=${resetToken}&id=${user._id}`

        res.status(200).json({
            message: `El restablecimiento se ha solicitado con éxito`,
            token: resetToken,
        })
        // return link
    } catch (err) {
        return res.status(500).send({
            err,
            message: `Hubo un problema con el registro, intente más tarde`,
        })
    }
}

module.exports = postSolicitateNewPassword
