const express = require('express');
const { addDummyPasswordsResolver } = require('../app/user/admin/admin_dummy_password_resolver');

const router = express.Router();

/**
 * POST /api/admin/dummy-passwords/add
 * Add dummy passwords for users with null dummyPassword
 */
router.post('/dummy-passwords/add', addDummyPasswordsResolver);

module.exports = router;
