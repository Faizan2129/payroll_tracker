const express = require("express");
const session = require("express-session");
const { User } = require("./models/user");
const app = express();

app.use(express.static("static"));
app.set('view engine', 'pug');
app.set('views', './app/views');

app.use(express.urlencoded({ extended: true }));

const db = require('./services/db');
const oneHour = 60 * 60 * 1000;

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: oneHour
    }
}));

app.get('/register', (req, res) => {
    res.render('register');
});
app.get('/home', (req, res) => {
    res.render('home');
});



app.get("/dashboard", async function (req, res) {
    try {
        const userId = 1; // Replace with user session or auth ID
        
        // Fetch payroll records for the user
        const payrollRecords = await Payroll.getPayrollByUser(userId);

        // SQL queries for daily, monthly, yearly, and total amount sums
        const sql1 = 'SELECT SUM(Amount) AS TotalAmountToday FROM payroll WHERE selecteddate = CURDATE()';
        const sql2 = 'SELECT SUM(Amount) AS TotalAmountThisMonth FROM payroll WHERE YEAR(selecteddate) = YEAR(CURDATE()) AND MONTH(selecteddate) = MONTH(CURDATE())';
        const sql3 = 'SELECT SUM(Amount) AS TotalAmountThisYear FROM payroll WHERE YEAR(selecteddate) = YEAR(CURDATE())';
        const sql4 = 'SELECT SUM(Amount) AS TotalAmount FROM payroll';

        // Execute all SQL queries concurrently
        const [results1, results2, results3, results4] = await Promise.all([
            db.query(sql1),
            db.query(sql2),
            db.query(sql3),
            db.query(sql4)
        ]);

        // Render the dashboard page with the results
        res.render("dashboard", {
            payrollRecords: payrollRecords,
            today: results1[0].TotalAmountToday || 0,
            monthly: results2[0].TotalAmountThisMonth || 0,
            yearly: results3[0].TotalAmountThisYear || 0,
            total: results4[0].TotalAmount || 0
        });
    } catch (error) {
        console.error(`Error while fetching payroll records:`, error.message);
        res.render("dashboard", { errorMessage: 'Error fetching payroll records' });
    }
});








app.get('/login', (req, res) => {
    res.render('login', { loggedIn: req.session.loggedIn, currentPage: 'login' });
});

app.get('/profile', async (req, res) => {
    try {
        const userId = req.session.uid;
        const user = await User.findById(userId);
        res.render('profile', { data: user, loggedIn: req.session.loggedIn, currentPage: 'profile' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get("/", (req, res) => {
    if (req.session.uid) {
        res.send(`Welcome back, ${req.session.uid}!`);
    } else {
        res.render('login', { loggedIn: req.session.loggedIn });
    }
});

app.post('/set-password', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = new User(email);
        const uId = await user.getIdFromEmail();
        if (uId) {
            await user.setUserPassword(password);
            res.render('register', { successMessage: 'Password set successfully', loggedIn: req.session.loggedIn });
        } else {
            const newId = await user.addUser(email);
            res.render('register', { successMessage: 'Account created successfully', loggedIn: req.session.loggedIn });
        }
    } catch (err) {
        console.error(`Error while setting password `, err.message);
        res.render('register', { errorMessage: 'An error occurred while setting the password', loggedIn: req.session.loggedIn });
    }
});

app.post('/authenticate', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = new User(email);
        const uId = await user.getIdFromEmail();
        if (uId) {
            const match = await user.authenticate(password);
            if (match) {
                req.session.uid = uId;
                req.session.loggedIn = true;
                res.redirect('/home');
            } else {
                res.render('login', { errorMessage: 'Invalid password' });
            }
        } else {
            res.send('Invalid email');
        }
    } catch (err) {
        console.error(`Error while comparing `, err.message);
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(3000, () => {
    console.log(`Server running at http://127.0.0.1:3000/`);
});