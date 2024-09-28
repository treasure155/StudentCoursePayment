const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    profilePicture: { type: String },
    purchasedCourses: [String], // Store course IDs or names directly
    payments: [
        {
            date: { type: Date, required: true, default: Date.now },
            amount: { type: Number, required: true },
            reference: { type: String, required: true },
            status: { type: String, required: true, default: 'pending' },
            paymentMethod: { type: String }
        }
    ],
    passwordResetToken: { type: String }, // Token for password reset
    passwordResetExpires: { type: Date }   // Expiration time for token
});

const User = mongoose.model('User', userSchema);
module.exports = User;
