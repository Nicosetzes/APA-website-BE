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
            return res.status(400).json({
                auth: false,
                message: error.details[0].message,
            })

        let { email, password } = req.body

        const user = await retrieveUserByUserName(email)

        if (!user)
            return res.status(400).json({
                auth: false,
                message: "El usuario ingresado no existe",
            })

        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid)
            return res.status(400).json({
                auth: false,
                message: "La contraseña ingresada no es correcta",
            })

        const token = jwt.sign(
            {
                id: user._id,
            },
            jwtKey,
            {
                //   algorithm: "HS256",
                expiresIn: "4h",
            }
        )

        const userInfo = {
            email: user.email,
            nickname: user.nickname,
        }

        return res
            .cookie("jwt", token, {
                withCredentials: true,
                maxAge: 1000 * 60 * 60 * 4, // 4 horas //
                sameSite: "none",
                httpOnly: true,
                secure: process.env.NODE_ENV === "development" ? false : true,
            })
            .status(200)
            .json({
                auth: true,
                userInfo,
                message: `Bienvenid@ ${user.nickname}`,
            })
    } catch (err) {
        return res.status(500).json({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        })
    }
}

module.exports = postLogin
