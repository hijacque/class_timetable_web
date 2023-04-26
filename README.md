A web-based class schedule and faculty loading system for the Computer Science Department of Pamantasan ng Lungsod ng Maynila, proposed by JAVAwokeez team.

###### Prerequisites:
- git
- mySQL
- node.js
- gmail app password
- github account

### Installment and set up procedures
**Git**
1. Check if you already have git, open the terminal/command prompt and enter `git version`
2. If it says _git is not a command_, then download a git installer that is compatible with your OS
    - Windows: (https://gitforwindows.org/)
    - MacOS: install and setup homebrew (https://brew.sh/) then enter this command in the terminal `brew install git`
4. Open the terminal/command prompt and enter `git version` to make sure the installation was successful

**mySQL**
1. Download a mySQL installer compatible with your OS in https://dev.mysql.com/downloads/mysql/
2. Run the mySQL installer
3. Proceed with the default options until the _Installation_ part
4. Choose _Use Strong Password Encryption_ then enter a strong password for the root user
5. Wait for the installation process to finish
6. Open your terminal and enter `mysql -u root -p`, this will prompt you to enter the password you entered earlier
7. Now that mysql terminal is open, we need to create a new database and user of that database for the project, enter the following in the terminal:

    * Create new project database
    ```
    CREATE DATABASE class_sched_sys;
    ```
    * Create new user of the project's database
    ```
    CREATE USER 'class_sched_sys_user'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';
    GRANT ALL PRIVILEGES ON class_sched_sys.* TO 'class_sched_sys_user'@'localhost';
    ```
8. If no errors occur and the database is created, exit sql terminal by typing `\q` or `exit`

**Node.js**
1. Choose the right installer for your OS in https://nodejs.org/en/download/
2. Run the node installer and accept all default options and license agreement
3. Wait for installation to finish then restart you computer
4. Open your terminal and check if node was installed by typing `node -v`

**Gmail App password**
(this is for e-mail transfer)
1. Go to https://myaccount.google.com/apppasswords
2. Log in to your google account or create one as needed then log in
3. Click the _Select app_ dropdown menu and choose _Other (Custom name)_
4. Enter "class_sched_sys" then click _GENERATE_
5. Copy the password and **SAVE IT** for when setting up the project

**Github**
(You need this to collaborate in the project)
1. Go to https://github.com/ and sign up
2. \* follow what they say *
3. But you probably already have a github account
4. Log in to your github account

# How to get started with the project
1. Open your terminal, then "cd" to the folder you want the project to be in
2. Clone the project by entering the following command:
    ```
    git clone https://github.com/hijacque/class_timetable_web.git
    ```
3. Open the project folder that you just cloned from the terminal `cd TO_ROOT_PROJECT_FOLDER`
4. Start mySQL server by typing `mysql.server start`
5. Check for `class_sched_sys.sql` file, then enter the command:
    ```
    mysql -u root -p class_sched_sys < class_sched_sys.sql
    ```
    Enter your pasword to initialize database schema
6. Install node package dependencies by entering `npm install` in the terminal
7. Open your text editor and in the root project folder create a file and name it `.env`
8. Open the `.env` file and fill it with the following:
    ```
    DB_PORT="localhost"
    DB_USER=“class_sched_sys_user”
    DB_PASSWORD=“class_sched_sys_user's_PASSWORD”
    DB_NAME="class_sched_sys"

    API_PORT=3000
    API_DOMAIN="localhost"
    API_KEY=“RANDOM_32LENGTH_STRING1”

    SMTP_PORT=587
    SMTP="smtp.gmail.com"
    SMTP_SENDER="YOUR_GMAIL_ADDRESS"
    SMTP_PASSWORD="GMAIL_APP_PASSWORD"

    COOKIE_KEY="RANDOM_32LENGTH_STRING2”
    HELP_KEY="RANDOM_32LENGTH_STRING3”
    ```
9. Your computer is now a local server for the project
10. Open your terminal and enter `node index.js` or if you have _nodemon_ use `nodemon index.js`
11. Open your browser (Chrome, Edge, IE, etc.) then access http://localhost:3000/login or signup an account in http://localhost:3000/signup **(use a different e-mail from the gmail used for the app password)**