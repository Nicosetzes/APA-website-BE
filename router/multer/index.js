const path = require("path")
const multer = require("multer")

// MULTER CONFIG FOR TOURNAMENT IMG UPLOAD BEGINS //

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "./uploads/")
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
        cb(
            null,
            file.fieldname +
                "-" +
                uniqueSuffix +
                path.extname(file.originalname)
        )
        // cb(null, "file.png");
    },
})

const fileFilter = (req, file, cb) => {
    // if (!file.originalname.match(/\.(png|jpg)$/)) {     // upload only png and jpg format
    if (!file.originalname.match("png")) {
        // upload only png and jpg format
        return cb(new Error("Please upload a Image in PNG format"))
    }
    cb(undefined, true)
}

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024, // 1024 * 1024 Bytes = 1 MB
    },
    fileFilter: fileFilter,
})

module.exports = upload
