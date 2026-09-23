const REQUIRED_ENVIRONMENT_VARIABLES = [
    "MONGO_URI",
    "TOKEN_SECRET",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
]

const validateEnvironment = () => {
    const missingVariables = REQUIRED_ENVIRONMENT_VARIABLES.filter(
        (name) => !process.env[name]?.trim()
    )

    if (missingVariables.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missingVariables.join(
                ", "
            )}`
        )
    }
}

module.exports = {
    REQUIRED_ENVIRONMENT_VARIABLES,
    validateEnvironment,
}
