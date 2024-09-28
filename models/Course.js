// models/Course.js
const mongoose = require('mongoose');

// Course Schema
const courseSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    iconClass: { type: String, required: true },
    duration: { type: Number, required: true },
    classType: {
        type: String,
        enum: ['Online', 'In-Person'],
        required: true
    },
    classTime: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    enrolledUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // Add this line
});

// Course model
const Course = mongoose.model('Course', courseSchema);
module.exports = Course; // Correct the export statement
