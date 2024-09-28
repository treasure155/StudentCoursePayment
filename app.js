const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const passport = require('passport');
const dotenv = require('dotenv');
const session = require('express-session');
const mongoose = require('mongoose');
const LocalStrategy = require('passport-local').Strategy;
const Admin = require('./models/Admin');
const bcrypt = require('bcrypt');
const flash = require('connect-flash');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.json()); 
app.use(flash());

app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
    rolling: true
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
        try {
            const admin = await Admin.findOne({ email });
            if (!admin) {
                return done(null, false, { message: 'Invalid credentials' });
            }
            const match = await bcrypt.compare(password, admin.password);
            if (!match) {
                return done(null, false, { message: 'Invalid credentials' });
            }
            return done(null, admin);
        } catch (error) {
            return done(error);
        }
    }
));

passport.serializeUser((admin, done) => {
    done(null, admin.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const admin = await Admin.findById(id);
        done(null, admin);
    } catch (err) {
        done(err);
    }
});

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB...', err));

const indexRouter = require('./routes/index');
const adminRouter = require('./routes/admin');
app.use('/', indexRouter);
app.use('/admin', adminRouter);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
