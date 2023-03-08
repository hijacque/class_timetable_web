const nodemailer = require("nodemailer");
const crypt = require("node:crypto");
const ejs = require("ejs");

class AppMailer {
    #transporter;

    constructor(host, port, email, password, domain, title) {
        this.domain = domain;
        this.title = title;
        this.email = email;
        this.#transporter = nodemailer.createTransport({
            host: host,
            port: port,
            auth: {
                user: email,
                pass: password,
            }
        });
    }

    sendEmail(envelope = {}) {
        envelope.from = `"${this.title}" ${this.email}`;
        console.log(`Sending e-mail to [${envelope.to}] ...`);
        this.#transporter.sendMail(envelope, function (err, info) {
            if (err) {
                console.log(err);
            } else {
                console.log(`${info.accepted} accepted e-mail from ${this.title}!`);
            }
        });
    }
}

module.exports = { AppMailer };