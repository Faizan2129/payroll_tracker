const db = require('../services/db');
const bcrypt = require("bcryptjs");

class User {

    // Id of the user
    id;

    // Email of the user
    email;

    constructor(email) {
        this.email = email;
    }
    
    // Get an existing user id from an email address, or return false if not found
    async getIdFromEmail()  {
        let sql = "SELECT id FROM Users WHERE Users.email = ?";
        const result = await db.query(sql, [this.email]);
        if (result.length > 0) {
            this.id = result[0].id;
            return this.id;
        }
        return false;
    }

    // Add a password to an existing user
    async setUserPassword(password) {
        const pw = await bcrypt.hash(password, 10);
        let sql = "UPDATE Users SET password = ? WHERE Users.id = ?";
        await db.query(sql, [pw, this.id]);
        return true;
    }
    
    // Add a new record to the users table    
    async addUser(password) {
        const pw = await bcrypt.hash(password, 10);
        let sql = "INSERT INTO Users (email, password) VALUES (?, ?)";
        const result = await db.query(sql, [this.email, pw]);
        this.id = result.insertId;
        return this.id;
    }

    // Test a submitted password against a stored password
    async authenticate(submitted) {
        let sql = "SELECT password FROM Users WHERE id = ?";
        const result = await db.query(sql, [this.id]);
        const match = await bcrypt.compare(submitted, result[0].password);
        return match;
    }

    // Retrieve a user by their ID
    static async findById(id) {
        const sql = "SELECT id, email FROM Users WHERE id = ?";
        const result = await db.query(sql, [id]);
        if (result.length > 0) {
            const user = new User(result[0].email);
            user.id = result[0].id;
            return user;
        }
        return null; // User not found
    }
}

module.exports = {
    User
};
