const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Course = require('../models/Course');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const passport = require('passport');

const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/admin/adminLogin');
};

router.get('/adminRegister', (req, res) => {
    res.render('admin/adminRegister', { errorMessage: null });
});

router.post('/adminRegister', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = new Admin({ name, email, password: hashedPassword });
        await admin.save();
        res.redirect('/admin/adminLogin');
    } catch (error) {
        console.error(error);
        res.render('admin/adminRegister', { errorMessage: 'Error registering admin.' });
    }
});

router.get('/adminLogin', (req, res) => {
    res.render('admin/adminLogin', { errorMessage: req.flash('error') });
});

router.post('/adminLogin', passport.authenticate('local', {
    successRedirect: '/admin/dashboard',
    failureRedirect: '/admin/adminLogin',
    failureFlash: true
}));

router.get('/dashboard', ensureAuthenticated, async (req, res) => {
    try {
        const users = await User.find().populate('purchasedCourses');
        const courses = await Course.find();
        res.render('admin/adminDashboard', { users, courses });
    } catch (error) {
        console.error(error);
        res.render('admin/adminDashboard', { users: [], courses: [] });
    }
});

router.get('/addCourse', ensureAuthenticated, (req, res) => {
    res.render('admin/addCourse');
});

router.post('/courses/add', async (req, res) => {
    try {
        const { name, price, description, duration, classType, classTime, iconClass } = req.body;
        const course = new Course({
            name,
            price,
            description,
            duration,
            classType,
            classTime,
            iconClass
        });
        await course.save();
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error("Error saving course:", error);
        res.redirect('/admin/dashboard');
    }
});

router.get('/courses/edit/:id', ensureAuthenticated, async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).send('Course not found');
        }
        res.render('admin/editCourse', { course });
    } catch (err) {
        console.error('Error fetching course:', err);
        res.status(500).send('Internal server error');
    }
});

router.post('/courses/edit/:id', ensureAuthenticated, async (req, res) => {
    const { name, price, description, duration, classType, classTime } = req.body;

    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).send('Course not found');
        }
        course.name = name;
        course.price = price;
        course.description = description;
        course.duration = duration;
        course.classType = classType;
        course.classTime = classTime;
        await course.save();
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('Error updating course:', err);
        res.status(500).send('Internal server error');
    }
});

router.post('/courses/delete/:id', ensureAuthenticated, async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error(error);
        res.redirect('/admin/dashboard');
    }
});

router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        res.redirect('/admin/adminLogin');
    });
});

module.exports = router;
