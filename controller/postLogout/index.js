const { retrieveUserById } = require("../../service")

const postLogout = async (req, res) => {
    try {
        const { id } = req.user
        const { nickname } = await retrieveUserById(id)
        // With JWT tokens, logout is handled client-side by removing the token
        // Server-side logout would require token blacklisting (can be added later if needed)
        return res.status(200).send({
            auth: false,
            message: `${nickname}, su sesión ha sido cerrada con éxito`,
        })
    } catch (err) {
        return res.status(500).send({
            auth: false,
            message: `Error inesperado, intente más tarde`,
        })
    }
}

module.exports = postLogout
