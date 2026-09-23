const asyncHandler = (handler) => {
    return function asyncExpressHandler(req, res, next) {
        return Promise.resolve()
            .then(() => handler(req, res, next))
            .catch(next)
    }
}

module.exports = asyncHandler
