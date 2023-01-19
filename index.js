const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const crypto = require("node:crypto");
const { AppDatabase } = require("./lib/app-database");
const { AppMailer } = require("./lib/app-mailer");
require("dotenv").config();
const config = process.env;

const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

if (!process.env.SECRET) process.env.SECRET = crypto.randomBytes(28).toString("base64");
app.use(cookieParser(process.env.SECRET));

// local app variables
app.locals.database = new AppDatabase(config.DB_PORT, config.DB_USER, config.DB_PASSWORD, config.DB_NAME);
app.locals.mailer = new AppMailer(
    config.SMTP, config.SMTP_PORT, config.SMTP_SENDER, config.SMTP_PASSWORD,
    "http://localhost:3000", "JAVAwokeez Team"
);

//routes
app.use("/", require("./routes/root"));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Server listening on port " + port);
});