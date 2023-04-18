const { retrieveUserById } = require("./../../service")

const jwt = require("jsonwebtoken")
const jwtKey = process.env.TOKEN_SECRET

const getIsUserAuthenticated = async (req, res) => {
    const token = req.cookies.jwt

    if (!token) return res.status(200).json({ auth: false }) // Revisar código de error //
    let decodedToken
    try {
        decodedToken = jwt.verify(token, process.env.TOKEN_SECRET)
    } catch (error) {
        res.status(400).json({
            auth: false,
            message: "Sesión no válida, error en las credenciales",
        })
    }
    const { id } = decodedToken

    try {
        const user = await retrieveUserById(id)
        const newToken = jwt.sign(
            {
                id: user._id,
            },
            jwtKey,
            {
                //   algorithm: "HS256",
                expiresIn: "4h",
            }
        )
        const { email, nickname } = user // TODO: Add user roles
        const userInfo = {
            email,
            nickname,
        }
        return res
            .cookie("jwt", newToken, {
                withCredentials: true,
                maxAge: 1000 * 60 * 60 * 4, // 4 horas //
                sameSite: "none",
                httpOnly: true,
                secure: process.env.NODE_ENV === "development" ? false : true,
            })
            .status(200)
            .send({
                auth: true,
                user: userInfo,
                message: `Hola ${nickname}, bienvenid@`,
            })
    } catch (err) {
        return res.status(500).send({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        }) // Revisar código de error //
    }
}

module.exports = getIsUserAuthenticated
