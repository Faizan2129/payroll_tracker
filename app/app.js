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
    res.render('home',{currentPage: 'home'});
});



app.get("/dashboard", async function (req, res) {
    try {
        // // Ensure the user is logged in
        // if (!req.session.uid) {
        //     return res.redirect("/login");
        // }
        const userId = req.session.uid || 1;

        // SQL queries for payroll summary and user-specific records
        const sql1 = 'SELECT SUM(total_pay) AS TotalAmountToday FROM payroll WHERE DATE(work_date) = CURDATE() AND user_id = ?';
        const sql2 = 'SELECT SUM(total_pay) AS TotalAmountThisMonth FROM payroll WHERE YEAR(work_date) = YEAR(CURDATE()) AND MONTH(work_date) = MONTH(CURDATE()) AND user_id = ?';
        const sql3 = 'SELECT SUM(total_pay) AS TotalAmountThisYear FROM payroll WHERE YEAR(work_date) = YEAR(CURDATE()) AND user_id = ?';
        const sql4 = 'SELECT SUM(total_pay) AS TotalAmount FROM payroll WHERE user_id = ?';
        const sql5 = 'SELECT * FROM payroll WHERE user_id = ?';

        // Execute queries concurrently with user-specific parameter
        const [results1, results2, results3, results4, results5] = await Promise.all([
            db.query(sql1, [userId]),
            db.query(sql2, [userId]),
            db.query(sql3, [userId]),
            db.query(sql4, [userId]),
            db.query(sql5, [userId])
        ]);

        // Render the dashboard page with the results
        res.render("dashboard", {
            today: results1[0]?.TotalAmountToday || 0,
            monthly: results2[0]?.TotalAmountThisMonth || 0,
            yearly: results3[0]?.TotalAmountThisYear || 0,
            total: results4[0]?.TotalAmount || 0,
            payroll_records: results5 || [],
            loggedIn: req.session.loggedIn,
            currentPage: 'dashboard',
        });
    } catch (error) {
        console.error("Error while fetching payroll records:", error.message);
        res.render("dashboard", {
            errorMessage: "An error occurred while fetching payroll records.",
        });
    }
});



app.get('/login', (req, res) => {
    res.render('login', { loggedIn: req.session.loggedIn, currentPage: 'login' });
});


app.get('/update/:id', async (req, res) => {
    try {
        const payrollId = req.params.id;
        const sql = 'SELECT * FROM payroll WHERE id = ?';
        const [payroll] = await db.query(sql, [payrollId]);

        if (!payroll || payroll.length === 0) {
            return res.status(404).send('Payroll record not found');
        }

        console.log(payroll);
        res.render('update', {
            id: payroll.id,
            user_id: payroll.user_id,
            company: payroll.company,
            hours_worked: payroll.hours_worked,
            hourly_rate: payroll.hourly_rate,
            overtime_hours: payroll.overtime_hours,
            overtime_rate: payroll.overtime_rate,
            work_date: new Date(payroll.work_date).toISOString().slice(0, 16)
          });
    } catch (error) {
        console.error('Error fetching payroll:', error);
        res.status(500).send('Error fetching payroll');
    }
});


app.get('/create', (req, res) => {
    res.render('create', { loggedIn: req.session.loggedIn, currentPage: 'create' });
});

app.get('/profile', async (req, res) => {
    try {
        if (!req.session.uid) {
            return res.redirect('/login');
        }

        const userId = req.session.uid;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).render('profile', { errorMessage: 'User not found' });
        }

        res.render('profile', {
            data: user,
            loggedIn: req.session.loggedIn,
            currentPage: 'profile',
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('profile', { errorMessage: 'Internal Server Error' });
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
                res.redirect('/dashboard');
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

app.post('/payroll/create', async (req, res) => {
    // const userId = req.session.uid;
    try {
        const { user_id, company, hours_worked, hourly_rate, overtime_hours, overtime_rate, work_date } = req.body;

        // SQL query to insert a new payroll record without total_pay (it will be calculated automatically)
        const sql = `INSERT INTO payroll (user_id, company, hours_worked, hourly_rate, overtime_hours, overtime_rate, work_date)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;

        await db.query(sql, [user_id, company, hours_worked, hourly_rate, overtime_hours, overtime_rate, work_date]);

        res.redirect('/dashboard'); // Redirect to dashboard or show a success message
    } catch (error) {
        console.error("Error creating payroll:", error);
        res.render('create-payroll', { errorMessage: 'Error creating payroll record.' });
    }
});


app.post('/payroll/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { hours_worked, hourly_rate, overtime_hours, overtime_rate, work_date } = req.body;
        console.log(req.body);

        // Remove total_pay from the SQL update since it's calculated by the database
        const sql = 'UPDATE payroll SET hours_worked = ?, hourly_rate = ?, overtime_hours = ?, overtime_rate = ?, work_date = ? WHERE id = ?';
        await db.query(sql, [hours_worked, hourly_rate, overtime_hours, overtime_rate, work_date, id]);

        res.redirect('/dashboard'); // Redirect back to dashboard after updating the payroll
    } catch (error) {
        console.error("Error updating payroll:", error.message);
        res.render('dashboard', { errorMessage: 'An error occurred while updating payroll.' });
    }
});


app.post('/payroll/delete/:id', async (req, res) => {
    try {
        const { id } = req.params; 

        const sql = 'DELETE FROM payroll WHERE id = ?';
        await db.query(sql, [id]);

        res.redirect('/dashboard');
    } catch (error) {
        console.error("Error deleting payroll:", error.message);
        res.render('dashboard', { errorMessage: 'An error occurred while deleting payroll.' });
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(3000, () => {
    console.log(`Server running at http://127.0.0.1:3000/`);
});