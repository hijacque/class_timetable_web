const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const ejs = require("ejs");
const crypto = require("node:crypto");

const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

if (!process.env.SECRET) process.env.SECRET = crypto.randomBytes(28).toString("base64");
app.use(cookieParser(process.env.SECRET));

//routes
app.use("/", require("./routes/root"));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Server listening on port " + port);
});