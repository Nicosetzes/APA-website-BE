const { retrieveUserByUserName, originateUser } = require("./../../service")

const bcrypt = require("bcrypt")

const postRegister = async (req, res) => {
    try {
        // const { error } = schemaRegister.validate(req.body);

        // if (error) return res.status(400).json({ error: error.details[0].message });

        let { email, password, nickname } = req.body

        const doesUserExist = await retrieveUserByUserName(email)
        if (doesUserExist)
            return res.status(400).json({
                message: `Ya existe un usuario con el email ${doesUserExist.email}`,
            })

        const salt = await bcrypt.genSalt(10)
        const hiddenPassword = await bcrypt.hash(password, salt)

        const user = { email, password: hiddenPassword, nickname }

        const newUser = await originateUser(user)
        res.json({
            user: newUser,
            message: `Hola ${newUser.nickname}, se ha registrado con éxito`,
        })
    } catch (err) {
        return res.status(500).send({
            err,
            message: `Hubo un problema con el registro, intente más tarde`,
        })
    }
}

module.exports = postRegister
