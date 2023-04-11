const getHome = async (req, res) => {
    try {
        req.userId
            ? res.status(200).json({
                  user: {
                      id: req.userId,
                      name: req.userEmail,
                      nickname: req.userNickname,
                  },
              })
            : res
                  .status(200)
                  .json({ data: "El usuario aun no ha iniciado sesión" })
    } catch (err) {
        return res.status(500).send("Something went wrong!" + err)
    }
}

module.exports = getHome
