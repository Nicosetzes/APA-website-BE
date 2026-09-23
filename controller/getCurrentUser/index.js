const getCurrentUser = (req, res) => {
    res.set("Cache-Control", "no-store")

    return res.status(200).json({
        auth: true,
        user: {
            id: req.user.id,
            nickname: req.user.name,
            role: req.user.role,
        },
    })
}

module.exports = getCurrentUser
