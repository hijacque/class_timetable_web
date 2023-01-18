const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SECRET || "secret"));

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log("Server listening on port " + port);
});