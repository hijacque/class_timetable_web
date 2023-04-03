const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { AppDatabase } = require("./lib/app-database");
const { AppMailer } = require("./lib/app-mailer");
require("dotenv").config();
const config = process.env;

const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_KEY));

// local app variables
app.locals.database = new AppDatabase(config.DB_PORT, config.DB_USER, config.DB_PASSWORD, config.DB_NAME, true);
app.locals.mailer = new AppMailer(
    config.SMTP, config.SMTP_PORT, config.SMTP_SENDER, config.SMTP_PASSWORD,
    "http://localhost:3000", "JAVAwokeez Team"
);

// routes
app.use("/", require("./routes/root"));
app.use("/help", require("./routes/help"));
app.use("/api", require("./routes/api"));
app.use("/schedule", require("./routes/schedule"));

app.get("/test", (req, res) => {
    res.status(200).json(req.signedCookies);
});

app.get("*", (req, res) => res.status(404).send("You don't have to go back, but you can't stay here"));

// initialize server
const port = config.PORT || 3000;
app.listen(port, () => {
    console.log("Server listening on port " + port);
});