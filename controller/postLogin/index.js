const { retrieveUserByUserName } = require("./../../service")

const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const jwtKey = process.env.TOKEN_SECRET
const Joi = require("@hapi/joi")

const postLogin = async (req, res) => {
    // Validation with custom messages //
    const schemaLogin = Joi.object({
        email: Joi.string().max(255).required().email().messages({
            "string.empty": `Ingrese un email`,
            "any.required": `El email es requerido`,
            "string.email": `Debe ingresar un email válido`,
        }),
        password: Joi.string().min(6).max(1024).required().messages({
            "string.min": `La contraseña debe tener un mínimo de {#limit} caracteres`,
            "string.empty": `Ingrese una contraseña`,
            "any.required": `La contraseña es requerida`,
        }),
    })

    try {
        const { error } = schemaLogin.validate(req.body)

        if (error)
            return res.status(400).send({
                auth: false,
                message: error.details[0].message,
            })

        let { email, password } = req.body

        const user = await retrieveUserByUserName(email)

        if (!user)
            return res.status(400).send({
                auth: false,
                message: "El usuario ingresado no existe",
            })

        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid)
            return res.status(400).send({
                auth: false,
                message: "La contraseña ingresada no es correcta",
            })

        const token = jwt.sign(
            {
                id: user._id,
                name: user.nickname,
                /* In the future I can add role: "user" */
            },
            jwtKey,
            {
                //   algorithm: "HS256",
                expiresIn: "6h",
            }
        )

        return res
            .cookie("access_token", token, {
                withCredentials: true,
                maxAge: 1000 * 60 * 60 * 6, // 6 horas //
                // Borré el atributo sameSite, para ver si las cookies se despliegan en el browser outside localHost //
                httpOnly: process.env.NODE_ENV === "production",
                secure: process.env.NODE_ENV === "production",
            })
            .status(200)
            .send({
                auth: true,
                id: user._id,
                message: `Bienvenid@ ${user.nickname}`,
            })
    } catch (err) {
        return res.status(500).send({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        })
    }
}

module.exports = postLogin
