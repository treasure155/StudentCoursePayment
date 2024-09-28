const express = require('express');
const session = require('express-session');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const fs = require('fs');
const axios = require('axios');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const Course = require('../models/Course');
const Admin = require('../models/Admin');
const crypto = require('crypto');


function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

router.get('/dashboard', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;

    try {
        const user = await User.findById(userId).populate('purchasedCourses');

        if (user) {
            res.render('dashboard', {
                user: user,
                payments: user.payments || [],
                purchasedCourses: user.purchasedCourses || []
            });
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        res.status(500).send('Error loading dashboard');
    }
});

router.post('/enroll-course', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;
    const { courseId } = req.body;

    try {
        const user = await User.findById(userId);
        if (user) {
            if (!user.purchasedCourses.includes(courseId)) {
                user.purchasedCourses.push(courseId);
                await user.save();
            }
            return res.redirect('/dashboard');
        } else {
            res.status(404).send('User not found');
        }
    } catch (error) {
        res.status(500).send('Error enrolling in course');
    }
});

router.get('/', (req, res) => {
    res.render('home', { user: req.session.user, session: req.session });
});

router.get('/index', async (req, res) => {
    try {
        const courses = await Course.find();
        const isAdmin = req.session.isAdmin || false;
        res.render('index', { products: courses, user: req.session.user, admin: isAdmin });
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

router.post('/add-to-cart', async (req, res) => {
    const courseId = req.body.productId;

    try {
        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        if (!req.session.cart) {
            req.session.cart = [];
        }

        req.session.cart.push({
            id: course._id.toString(),
            name: course.name,
            price: course.price
        });

        res.json({ success: true, cart: req.session.cart });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/remove-from-cart', isAuthenticated, (req, res) => {
    const { courseId } = req.body;

    if (!req.session.cart || req.session.cart.length === 0) {
        return res.status(400).send('Cart is empty');
    }

    req.session.cart = req.session.cart.filter(product => product && product.id.toString() !== courseId);

    res.redirect('/cart');
});

router.get('/cart', isAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart });
});

router.get('/checkout', isAuthenticated, (req, res) => {
    if (!req.session.cart || req.session.cart.length === 0) {
        return res.redirect('/cart');
    }

    res.render('checkout', {
        cart: req.session.cart,
        user: req.session.user
    });
});

router.post('/pay', isAuthenticated, (req, res) => {
    const { email, amount } = req.body;

    if (!amount) {
        return res.status(400).send('Amount is required');
    }

    req.session.paymentDetails = {
        amount: amount
    };

    const headers = {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
    };

    axios.post('https://api.paystack.co/transaction/initialize', {
        email,
        amount: amount * 100,
        callback_url: 'http://localhost:3000/payment/callback'
    }, { headers })
        .then(response => {
            res.redirect(response.data.data.authorization_url);
        })
        .catch(error => {
            res.send('An error occurred while initializing payment');
        });
});

router.get('/payment/callback', (req, res) => {
    const { reference } = req.query;
    const headers = {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
    };

    axios.get(`https://api.paystack.co/transaction/verify/${reference}`, { headers })
        .then(async response => {
            if (response.data.data.status === 'success') {
                const user = await User.findById(req.session.userId);
                const enrolledCourses = req.session.cart.map(course => course.id);

                if (req.session.paymentDetails) {
                    const paymentDetails = {
                        date: new Date(),
                        amount: req.session.paymentDetails.amount,
                        reference: reference,
                        status: 'successful',
                        paymentMethod: 'Paystack'
                    };
                    user.payments.push(paymentDetails);
                    await user.save();

                    await updateAdminDashboard(enrolledCourses, user._id);

                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: user.email,
                        subject: 'Payment Successful - TechAlpha Courses',
                        text: `Hello ${user.name},\n\nYour payment was successful. Please prepare for your classes.\n\nBest regards,\nTechAlpha Team`
                    };
                    await transporter.sendMail(mailOptions);

                    req.session.cart = [];
                    delete req.session.paymentDetails;
                    return res.redirect('/dashboard');
                } else {
                    res.send('Payment details missing.');
                }
            } else {
                res.send('Payment was not successful');
            }
        })
        .catch(error => {
            res.send('An error occurred while verifying payment');
        });
});

async function updateAdminDashboard(courseIds, userId) {
    try {
        for (const courseId of courseIds) {
            await Course.findByIdAndUpdate(courseId, {
                $addToSet: { enrolledUsers: userId }
            });
        }
    } catch (err) {
        console.error('Error updating admin dashboard:', err);
    }
}

router.get('/register', (req, res) => {
    res.render('register', { errorMessage: '' });
});

router.post('/register', upload.single('profilePicture'), async (req, res) => {
    const { name, email, password, address, phone } = req.body;

    if (!name || !email || !password || !address || !phone) {
        return res.status(400).send('All fields are required');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).send('Email already registered');
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name,
            email,
            password: hashedPassword,
            address,
            phone,
            profilePicture: req.file ? '/uploads/' + req.file.filename : null,
            payments: [],
            purchasedCourses: []
        });

        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Welcome to TechAlpha Courses!',
            text: `Hello ${name},\n\nThank you for registering at TechAlpha Courses. We are excited to have you on board!\n\nBest regards,\nTechAlpha Team`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
            } else {
                console.log('Email sent:', info.response);
            }
        });

        res.redirect('/login');
    } catch (err) {
        res.status(500).send('Error creating user');
    }
});

router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.userId = user._id;
                req.session.user = user;
                return res.redirect('/dashboard');
            }
        }
        res.status(400).send('Invalid email or password');
    } catch (error) {
        res.status(500).send('Server error');
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.redirect('/');
    });
});


router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { message: null });
});

// Handle forgot password form submission
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).render('forgot-password', { message: 'No account with that email address exists.' });
        }

        const token = crypto.randomBytes(20).toString('hex');

        user.passwordResetToken = token;
        user.passwordResetExpires = Date.now() + 3600000; // 1 hour

        await user.save();

        const resetURL = `http://${req.headers.host}/reset-password/${token}`;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Password Reset - TechAlpha',
            text: `You are receiving this because you requested a password reset for your TechAlpha account.\n\n
            Please click on the following link, or paste it into your browser to complete the process:\n\n
            ${resetURL}\n\n
            If you did not request this, please ignore this email and your password will remain unchanged.`,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).render('password-reset-notification', { email }); // Render the notification page
    } catch (error) {
        res.status(500).render('forgot-password', { message: 'Error processing password reset request.' });
    }
});

// Route to display reset password form
router.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;

    try {
        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).render('reset-password', { message: 'Password reset token is invalid or has expired.', token: null });
        }

        res.render('reset-password', { token, message: null }); // Render the reset password form
    } catch (error) {
        res.status(500).render('reset-password', { message: 'Error verifying password reset token.', token: null });
    }
});

// Handle password reset form submission
router.post('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).render('reset-password', { message: 'Password reset token is invalid or has expired.', token: null });
        }

        // Update password
        user.password = await bcrypt.hash(password, 10);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Your password has been changed',
            text: `Hello,\n\nThis is a confirmation that the password for your account has just been changed.\n`,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).render('password-changed'); // Render the success page
    } catch (error) {
        res.status(500).render('reset-password', { message: 'Error resetting password.', token });
    }
});


router.get('/password-reset-notification', (req, res) => {
    res.render('password-reset-notification', { email: null });
});

router.get('/password-changed', (req, res) => {
    res.render('password-changed');
});

module.exports = router;
